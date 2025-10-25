import * as vscode from 'vscode';
import { TracePointService } from './TracePointService';

export class DescriptionViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private _extensionUri: vscode.Uri, private service: TracePointService) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml('');

        webviewView.webview.onDidReceiveMessage(async msg => {
            if (msg.command === 'descriptionChanged') {
                await this.service.updateTracePointDescription(msg.itemId, msg.description);
            }
        });
    }

    public updateDescription(itemId: string) {
        const tp = this.service.getTracePoints().find(tp => tp.id === itemId);
        if (tp && this._view) {
            this._view.webview.html = this._getHtml(tp.description || '');
        }
    }

    private _getHtml(description: string): string {
        return `
        <html>
        <body>
        <textarea style="width:100%;height:100%;" 
                  oninput="vscode.postMessage({command:'descriptionChanged', description:this.value, itemId:'${description}'})">
            ${description}
        </textarea>
        <script>
            const vscode = acquireVsCodeApi();
        </script>
        </body>
        </html>`;
    }
}
