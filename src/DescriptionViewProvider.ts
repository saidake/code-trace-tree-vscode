import * as vscode from 'vscode';
import { TracePointService } from './TracePointService';

export class DescriptionViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private _extensionUri: vscode.Uri,
        private service: TracePointService
    ) {
        // Listen to trace point and selection changes
        this.service.addListener(() => this.updateView());
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this.updateView(); // Initial render

        webviewView.webview.onDidReceiveMessage(async msg => {
            if (msg.command === 'descriptionChanged') {
                await this.service.updateTracePointDescription(msg.itemId, msg.description);
            }
        });
    }

    public updateView() {
        if (!this._view) return;

        const selectedIds = Array.from(this.service.getSelectedTracePointIds());
        let html: string;

        if (selectedIds.length !== 1) {
            // Disable textarea when no trace point or multiple trace points are selected
            html = this._getHtml('', '', true);
        } else {
            const tp = this.service.getTracePoints().find(tp => tp.id === selectedIds[0]);
            html = this._getHtml(tp?.id || '', tp?.description || '', false);
        }

        this._view.webview.html = html;
    }

    private _getHtml(itemId: string, description: string, disabled: boolean): string {
        return `
        <html>
        <body style="padding: 10px;">
            <textarea 
                style="width: 100%; height: 100%; resize: none; font-family: inherit;" 
                ${disabled ? 'disabled' : ''} 
                oninput="vscode.postMessage({command: 'descriptionChanged', description: this.value, itemId: '${itemId}'})"
            >${description}</textarea>
            <script>
                const vscode = acquireVsCodeApi();
            </script>
        </body>
        </html>`;
    }
}