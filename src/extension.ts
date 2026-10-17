import * as vscode from 'vscode';
import { AntigravityService } from './service';
import { StatusBarController } from './statusBar';
import { CommandController } from './commands';
import { AntigravityStatus } from './types';

let refreshTimer: NodeJS.Timeout | null = null;
let currentStatus: AntigravityStatus | null = null;

export function activate(context: vscode.ExtensionContext) {
  const service = new AntigravityService();
  const statusBar = new StatusBarController();

  // If a reload was triggered by our extension, automatically focus the Antigravity panel!
  if (context.globalState.get<boolean>('antigravity.autoFocusPanelAfterReload')) {
    context.globalState.update('antigravity.autoFocusPanelAfterReload', false);
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand('antigravity.panel.focus');
      } catch {}
    }, 1200);
  }

  const refresh = async (): Promise<void> => {
    try {
      const status = await service.fetchStatus();
      currentStatus = status;
      statusBar.update(status);
    } catch (err: any) {
      console.error('Antigravity Status fetch error:', err);
    }
  };

  const commandController = new CommandController(
    context,
    service,
    refresh,
    () => currentStatus
  );

  // Instant notification when quota or configuration change on disk
  service.onStatusChanged(async () => {
    await refresh();
  });

  const setupTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    const config = vscode.workspace.getConfiguration('antigravityStatus');
    const intervalSec = config.get<number>('refreshIntervalSeconds', 5);
    if (intervalSec > 0) {
      refreshTimer = setInterval(() => {
        refresh();
      }, intervalSec * 1000);
    }
  };

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('antigravity-status.statusBarClicked', () =>
      commandController.statusBarClicked()
    ),
    vscode.commands.registerCommand('antigravity-status.showMenu', () =>
      commandController.showMenu()
    ),
    vscode.commands.registerCommand('antigravity-status.showDashboard', () =>
      commandController.showDashboard()
    ),
    vscode.commands.registerCommand('antigravity-status.refresh', async () => {
      // Manual refresh also triggers online cloud sync
      service.refreshCurrentAccountOnline().catch(() => {});
      await refresh();
      vscode.window.showInformationMessage('反重力状态已刷新！');
    }),
    vscode.commands.registerCommand(
      'antigravity-status.reloadExtensionHost',
      () => commandController.reloadExtensionHost()
    ),
    vscode.commands.registerCommand('antigravity-status.reloadWindow', () =>
      vscode.commands.executeCommand('workbench.action.reloadWindow')
    ),
    vscode.commands.registerCommand('antigravity-status.restartBackend', () =>
      commandController.restartBackend()
    ),
    vscode.commands.registerCommand('antigravity-status.bindAccount', () =>
      commandController.bindAccount()
    ),
    vscode.commands.registerCommand('antigravity-status.showDetails', () =>
      commandController.showDashboard()
    ),
    statusBar,
    commandController,
    service,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('antigravityStatus')) {
        service.updateConfig();
        setupTimer();
        refresh();
      }
    })
  );

  // Initial timer setup & immediate fetch
  setupTimer();
  refresh();
}

export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
