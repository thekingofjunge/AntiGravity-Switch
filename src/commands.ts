import * as vscode from 'vscode';
import { AntigravityService } from './service';
import { DashboardPanel } from './dashboardPanel';
import { AntigravityStatus } from './types';
import { loginWithGoogleBrowser, resolveTokenInfo } from './oauth';

export class CommandController {
  private outputChannel: vscode.OutputChannel;

  constructor(
    private context: vscode.ExtensionContext,
    private service: AntigravityService,
    private refreshCallback: () => Promise<void>,
    private getLatestStatus: () => AntigravityStatus | null
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Google Antigravity Status');
  }

  public async statusBarClicked(): Promise<void> {
    const config = vscode.workspace.getConfiguration('antigravityStatus');
    const action = config.get<string>('statusBarClickAction', 'dashboard');
    if (action === 'menu') {
      await this.showMenu();
    } else {
      this.showDashboard();
    }
  }

  public showDashboard(): void {
    DashboardPanel.createOrShow(
      this.service,
      () => this.reloadExtensionHost(),
      () => this.restartBackend()
    );
  }

  public async showMenu(): Promise<void> {
    const status = this.getLatestStatus();
    const email = status?.account?.email ? ` (${status.account.email})` : ' (未绑定)';

    interface MenuQuickPickItem extends vscode.QuickPickItem {
      id: string;
    }

    const items: MenuQuickPickItem[] = [
      {
        id: 'show-dashboard',
        label: '$(dashboard) 📊 打开高级监控仪表盘 (Advanced Dashboard)',
        description: '高颜值图表看板：今日Token、费用估算、生成速度、模型明细',
      },
      {
        id: 'bind-account',
        label: `$(key) 🔑 登录/绑定当前 Google 账号${email}`,
        description: '通过官方浏览器一键授权，将账号与配额同步到状态栏与仪表盘',
      },
      {
        id: 'refresh',
        label: '$(refresh) 🔄 刷新状态与配额数据',
        description: '重新获取 5小时限额、周限额与 Token 消耗',
      },
      {
        id: 'reload-ext-host',
        label: '$(sync) ⚡ 重新加载反重力插件 (Restart Extension Host)',
        description: '推荐！平滑重启扩展宿主，瞬间恢复反重力连接',
      },
      {
        id: 'restart-backend',
        label: '$(debug-restart) 🔌 强制冷重启核心后端 (Kill & Restart agy.exe)',
        description: '终止旧进程并释放端口，强制冷拉起服务',
      },
      {
        id: 'reload-window',
        label: '$(window) 🪟 重载 VS Code 窗口 (Reload Window)',
        description: '完全重新加载编辑器界面',
      },
      {
        id: 'open-settings',
        label: '$(gear) ⚙️ 打开插件设置',
        description: '配置刷新频率、代理地址及显示格式',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要执行的反重力操作...',
    });

    if (!selected) {
      return;
    }

    switch (selected.id) {
      case 'show-dashboard':
        this.showDashboard();
        break;
      case 'bind-account':
        await this.bindAccount();
        break;
      case 'refresh':
        await this.refreshCallback();
        vscode.window.showInformationMessage('反重力状态已刷新！');
        break;
      case 'reload-ext-host':
        await this.reloadExtensionHost();
        break;
      case 'restart-backend':
        await this.restartBackend();
        break;
      case 'reload-window':
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        break;
      case 'open-settings':
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          'antigravityStatus'
        );
        break;
    }
  }

  public async bindAccount(): Promise<void> {
    interface BindMethodPickItem extends vscode.QuickPickItem {
      id: 'browser' | 'paste-token' | 'paste-json';
    }

    const items: BindMethodPickItem[] = [
      {
        id: 'browser',
        label: '$(globe) 🌐 浏览器跳转 Google 登录 (一键授权 · 推荐)',
        description: '自动拉起系统浏览器进行 Google 官方 OAuth 授权，无需手动复制 Token',
      },
      {
        id: 'paste-token',
        label: '$(key) 🔑 直接填 Token / Refresh Token (免输邮箱)',
        description: '直接粘贴 1// 开头的 Refresh Token，插件将自动解析 Google 邮箱并获取配额',
      },
      {
        id: 'paste-json',
        label: '$(json) 📋 粘贴完整 JSON 凭据',
        description: '粘贴包含 refresh_token、email 等字段的完整 JSON 格式凭据',
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '请选择绑定当前 Google 账号的方式...',
    });

    if (!selected) {
      return;
    }

    if (selected.id === 'browser') {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '已在浏览器打开 Google 登录页，等待授权回调...',
          cancellable: false,
        },
        async () => {
          try {
            const authRes = await loginWithGoogleBrowser();
            const res = await this.service.bindAccount(
              authRes.email,
              authRes.refreshToken,
              authRes.accessToken,
              authRes.idToken,
              authRes.name
            );
            if (res.success) {
              await this.refreshCallback();
              vscode.window.showInformationMessage(`🎉 ${res.message}`);
            } else {
              vscode.window.showErrorMessage(`绑定账号失败: ${res.message}`);
            }
          } catch (err: any) {
            vscode.window.showErrorMessage(`Google 授权失败: ${err.message || String(err)}`);
          }
        }
      );
      return;
    }

    // paste-token or paste-json
    const promptText =
      selected.id === 'paste-token'
        ? '请粘贴 OAuth Refresh Token (以 1// 开头，将自动提取对应 Google 邮箱)'
        : '请粘贴包含 refresh_token 的完整 JSON 凭据文本';

    const rawInput = await vscode.window.showInputBox({
      title: '绑定 Google Antigravity 账号 Token',
      prompt: promptText,
      placeHolder:
        selected.id === 'paste-token'
          ? '1//0g...'
          : '{"refresh_token": "1//...", "email": "user@gmail.com"}',
      password: selected.id === 'paste-token',
      ignoreFocusOut: true,
      validateInput: (val) => {
        if (!val || val.trim().length < 15) {
          return 'Token 内容过短，请提供有效的凭据';
        }
        return null;
      },
    });

    if (!rawInput) {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在校验 Token 并获取配额...',
        cancellable: false,
      },
      async () => {
        try {
          const resolved = await resolveTokenInfo(rawInput.trim());

          let finalEmail = resolved.email;
          if (!finalEmail) {
            finalEmail =
              (await vscode.window.showInputBox({
                title: '确认账号邮箱',
                prompt: '未能从该 Token 中自动解析出 Google 邮箱，请输入该账号邮箱',
                placeHolder: 'user@gmail.com',
                ignoreFocusOut: true,
              })) || '';
            if (!finalEmail) return;
          }

          const res = await this.service.bindAccount(
            finalEmail.trim(),
            resolved.refreshToken,
            resolved.accessToken,
            resolved.idToken,
            resolved.name
          );

          if (res.success) {
            await this.refreshCallback();
            vscode.window.showInformationMessage(`🎉 ${res.message}`);
          } else {
            vscode.window.showErrorMessage(`绑定账号失败: ${res.message}`);
          }
        } catch (err: any) {
          vscode.window.showErrorMessage(`解析 Token 失败: ${err.message || String(err)}`);
        }
      }
    );
  }

  public async reloadExtensionHost(): Promise<void> {
    await this.context.globalState.update('antigravity.autoFocusPanelAfterReload', true);
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在平滑重载扩展宿主...',
        cancellable: false,
      },
      async () => {
        try {
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } catch {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      }
    );
  }

  public async restartBackend(): Promise<void> {
    await this.context.globalState.update('antigravity.autoFocusPanelAfterReload', true);
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在终止旧后端并重新拉起 agy.exe...',
        cancellable: false,
      },
      async () => {
        // Kill backend
        await this.service.restartAgyBackend();
        // Wait 800ms for Windows socket/port to fully release
        await new Promise((r) => setTimeout(r, 800));

        // Restart extension host cleanly
        try {
          await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
        } catch {
          await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
      }
    );
  }

  public dispose(): void {
    this.outputChannel.dispose();
  }
}
