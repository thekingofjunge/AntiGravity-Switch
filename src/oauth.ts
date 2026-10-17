import * as http from 'http';
import * as https from 'https';
import { URL, URLSearchParams } from 'url';
import * as vscode from 'vscode';
import { AccountQuota, QuotaBucket, QuotaGroup } from './types';

export const ANTIGRAVITY_CLIENT_ID =
  process.env.ANTIGRAVITY_CLIENT_ID || '';
export const ANTIGRAVITY_CLIENT_SECRET =
  process.env.ANTIGRAVITY_CLIENT_SECRET || '';

export interface OAuthAccountResult {
  email: string;
  refreshToken: string;
  accessToken?: string;
  idToken?: string;
  name?: string;
}

function getProxyConfig(): { host: string; port: number } | null {
  const config = vscode.workspace.getConfiguration('antigravityStatus');
  const customProxy = config.get<string>('proxyUrl', '').trim();
  const rawProxy =
    customProxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';

  if (!rawProxy) {
    return null;
  }

  try {
    const pUrl = new URL(rawProxy.startsWith('http') ? rawProxy : `http://${rawProxy}`);
    return {
      host: pUrl.hostname,
      port: parseInt(pUrl.port, 10) || 80,
    };
  } catch {
    return null;
  }
}

export function requestGoogleApi(
  urlStr: string,
  postData?: string,
  customHeaders?: Record<string, string>
): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const proxy = getProxyConfig();

    const headers: Record<string, string> = { ...customHeaders };
    if (postData) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
      headers['Content-Length'] = String(Buffer.byteLength(postData));
    }

    const tryDirect = () => {
      const req = https.request(
        urlStr,
        {
          method: postData ? 'POST' : 'GET',
          headers,
          timeout: 10000,
        },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode || 200, data: JSON.parse(body) });
            } catch {
              resolve({ status: res.statusCode || 200, data: body });
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`请求超时: ${urlStr}`));
      });
      if (postData) req.write(postData);
      req.end();
    };

    if (!proxy) {
      tryDirect();
      return;
    }

    // CONNECT tunnel through proxy
    const proxyReq = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${url.host}:443`,
      timeout: 6000,
    });

    proxyReq.on('connect', (res, socket) => {
      const tlsReq = https.request(
        {
          host: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: postData ? 'POST' : 'GET',
          headers: {
            Host: url.hostname,
            ...headers,
          },
          socket,
          agent: false,
          timeout: 10000,
        } as any,
        (tlsRes) => {
          let body = '';
          tlsRes.on('data', (d) => (body += d));
          tlsRes.on('end', () => {
            try {
              resolve({ status: tlsRes.statusCode || 200, data: JSON.parse(body) });
            } catch {
              resolve({ status: tlsRes.statusCode || 200, data: body });
            }
          });
        }
      );
      tlsReq.on('error', () => {
        tryDirect();
      });
      tlsReq.on('timeout', () => {
        tlsReq.destroy();
        tryDirect();
      });
      if (postData) tlsReq.write(postData);
      tlsReq.end();
    });

    proxyReq.on('error', () => {
      tryDirect();
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      tryDirect();
    });

    proxyReq.end();
  });
}

export async function exchangeRefreshToken(
  refreshToken: string
): Promise<{ accessToken: string; email?: string; name?: string; idToken?: string }> {
  const params = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    refresh_token: refreshToken.trim(),
    grant_type: 'refresh_token',
  }).toString();

  const tokenRes = await requestGoogleApi('https://oauth2.googleapis.com/token', params);
  if (tokenRes.status !== 200 || !tokenRes.data.access_token) {
    throw new Error(`Refresh Token 换取失败: ${JSON.stringify(tokenRes.data)}`);
  }

  const accToken = tokenRes.data.access_token;
  const idToken = tokenRes.data.id_token || '';

  let email = '';
  let name = '';

  if (idToken) {
    try {
      const payload = JSON.parse(
        Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')
      );
      email = payload.email || '';
      name = payload.name || '';
    } catch {}
  }

  if (!email && accToken) {
    try {
      const infoRes = await requestGoogleApi(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${accToken}`
      );
      email = infoRes.data.email || '';
    } catch {}
  }

  return {
    accessToken: accToken,
    email,
    idToken,
    name,
  };
}

export async function fetchGoogleQuota(accessToken: string): Promise<AccountQuota> {
  const quotaRes = await requestGoogleApi(
    'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
    '{}',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  );

  const groups: QuotaGroup[] = [];
  const rawGroups = quotaRes.data?.quotaGroups || quotaRes.data?.quota_groups || [];

  for (const rg of rawGroups) {
    const buckets: QuotaBucket[] = [];
    for (const rb of rg.buckets || []) {
      buckets.push({
        bucket_id: rb.bucketId || rb.bucket_id || '',
        window: rb.window || '',
        remaining_fraction:
          typeof rb.remainingFraction === 'number'
            ? rb.remainingFraction
            : typeof rb.remaining_fraction === 'number'
            ? rb.remaining_fraction
            : 1,
        reset_time: rb.resetTime || rb.reset_time || '',
      });
    }
    groups.push({
      display_name: rg.displayName || rg.display_name || '',
      buckets,
    });
  }

  return {
    last_updated: Date.now(),
    subscription_tier: quotaRes.data?.subscriptionTier || quotaRes.data?.subscription_tier || 'Google AI',
    quota_groups: groups.length > 0 ? groups : null,
  };
}

export async function resolveTokenInfo(rawInput: string): Promise<OAuthAccountResult> {
  const trimmed = rawInput.trim();

  // 1. JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const tokenObj = parsed.token || parsed;
      const refreshToken = tokenObj.refresh_token || parsed.refresh_token || '';
      const accessToken = tokenObj.access_token || parsed.access_token || '';
      const idToken = tokenObj.id_token || parsed.id_token || '';
      let email = parsed.email || tokenObj.email || '';
      let name = parsed.name || tokenObj.name || '';

      if (!email && idToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')
          );
          email = payload.email || '';
          name = payload.name || name;
        } catch {}
      }

      if (refreshToken) {
        if (!email) {
          try {
            const resolved = await exchangeRefreshToken(refreshToken);
            email = resolved.email || email;
            name = resolved.name || name;
          } catch {}
        }
        return {
          email: email || '',
          refreshToken,
          accessToken,
          idToken,
          name: name || (email ? email.split('@')[0] : 'User'),
        };
      }
    } catch {}
  }

  // 2. Direct Refresh Token (starts with 1// or length >= 30)
  if (trimmed.startsWith('1//') || trimmed.length >= 30) {
    try {
      const resolved = await exchangeRefreshToken(trimmed);
      return {
        email: resolved.email || '',
        refreshToken: trimmed,
        accessToken: resolved.accessToken,
        idToken: resolved.idToken,
        name: resolved.name || (resolved.email ? resolved.email.split('@')[0] : 'User'),
      };
    } catch (e: any) {
      return {
        email: '',
        refreshToken: trimmed,
      };
    }
  }

  throw new Error('无法识别的 Token 格式。请提供有效的 Refresh Token (以 1// 开头) 或包含凭据的 JSON。');
}

export function loginWithGoogleBrowser(): Promise<OAuthAccountResult> {
  if (!ANTIGRAVITY_CLIENT_ID || !ANTIGRAVITY_CLIENT_SECRET) {
    vscode.window.showInformationMessage(
      '当前反重力监控已采用本地 Hub 原生直连技术，自动读取本地实时 5 小时配额与周配额，无需配置 Google OAuth。'
    );
    return Promise.reject(new Error('未配置 ANTIGRAVITY_CLIENT_ID / ANTIGRAVITY_CLIENT_SECRET'));
  }
  return new Promise((resolve, reject) => {
    let resolved = false;
    let server: http.Server;

    server = http.createServer(async (req, res) => {
      try {
        const address = server.address() as any;
        const currentPort = address ? address.port : 0;
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${currentPort}`);

        if (reqUrl.pathname === '/oauth-callback') {
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body style="background:#0b1120;color:#f87171;font-family:sans-serif;text-align:center;padding:50px;"><h2>授权失败</h2><p>${error}</p></body></html>`);
            if (!resolved) {
              resolved = true;
              server.close();
              reject(new Error(`Google 授权拒绝: ${error}`));
            }
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AntiGravity 授权成功</title>
  <style>
    body { background: #0b1120; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #121929; border: 1px solid #1d283f; padding: 48px; border-radius: 16px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.5); max-width: 450px; }
    h1 { color: #10b981; font-size: 24px; margin-bottom: 12px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 48px; margin-bottom: 16px;">🚀</div>
    <h1>Google 账号授权成功！</h1>
    <p>凭据已成功同步至 AntiGravity 状态监控。<br>您可以关闭此窗口返回 VS Code。</p>
  </div>
</body>
</html>`);

            if (!resolved) {
              resolved = true;
              server.close();

              try {
                const redirectUri = `http://127.0.0.1:${currentPort}/oauth-callback`;
                const params = new URLSearchParams({
                  client_id: ANTIGRAVITY_CLIENT_ID,
                  client_secret: ANTIGRAVITY_CLIENT_SECRET,
                  code,
                  grant_type: 'authorization_code',
                  redirect_uri: redirectUri,
                }).toString();

                const tokenRes = await requestGoogleApi(
                  'https://oauth2.googleapis.com/token',
                  params
                );

                if (tokenRes.status !== 200 || !tokenRes.data.refresh_token) {
                  reject(new Error(`换取 Token 失败: ${JSON.stringify(tokenRes.data)}`));
                  return;
                }

                const rfToken = tokenRes.data.refresh_token;
                const accToken = tokenRes.data.access_token || '';
                const idToken = tokenRes.data.id_token || '';

                let email = '';
                let name = '';

                if (idToken) {
                  try {
                    const payload = JSON.parse(
                      Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')
                    );
                    email = payload.email || '';
                    name = payload.name || '';
                  } catch {}
                }

                if (!email && accToken) {
                  try {
                    const infoRes = await requestGoogleApi(
                      `https://oauth2.googleapis.com/tokeninfo?access_token=${accToken}`
                    );
                    email = infoRes.data.email || '';
                  } catch {}
                }

                resolve({
                  email: email || 'google-user@gmail.com',
                  refreshToken: rfToken,
                  accessToken: accToken,
                  idToken,
                  name: name || (email ? email.split('@')[0] : 'User'),
                });
              } catch (e: any) {
                reject(e);
              }
            }
          }
        }
      } catch (err: any) {
        if (!resolved) {
          resolved = true;
          server.close();
          reject(err);
        }
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as any;
      const port = address.port;
      const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        new URLSearchParams({
          client_id: ANTIGRAVITY_CLIENT_ID,
          response_type: 'code',
          access_type: 'offline',
          prompt: 'consent',
          redirect_uri: redirectUri,
          scope:
            'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/cclog https://www.googleapis.com/auth/experimentsandconfigs',
        }).toString();

      vscode.env.openExternal(vscode.Uri.parse(authUrl));
    });

    // 2 minutes timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          server.close();
        } catch {}
        reject(new Error('等待浏览器 Google 授权超时 (2分钟)'));
      }
    }, 120000);
  });
}

