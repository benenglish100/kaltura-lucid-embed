import {EditorClient, JsonSerializable, Modal, Viewport} from 'lucid-extension-sdk';
import pasteModalHtml from '../resources/pastemodal.html';
import {KalturaConfig, isParseError, parseKalturaInput} from './kalturaparser';

/**
 * Modal shown when the user clicks the "Kaltura Video" content-dock button.
 * Presents a textarea; on submit it parses the input and, on success, drops a
 * link-unfurl block onto the current page via importLinks.
 */
export class PasteModal extends Modal {
    constructor(
        client: EditorClient,
        private readonly getConfig: () => Promise<KalturaConfig>,
    ) {
        super(client, {
            title: 'Add a Kaltura video',
            width: 520,
            height: 360,
            content: pasteModalHtml,
        });
    }

    protected async messageFromFrame(message: JsonSerializable): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        const msg = message as {[key: string]: JsonSerializable};

        if (msg['action'] === 'submit') {
            const rawInput = String(msg['value'] ?? '');
            const config = await this.getConfig();
            const outcome = parseKalturaInput(rawInput, config);

            if (isParseError(outcome)) {
                // If the failure is a missing account setting, offer the settings modal to admins.
                if (outcome.missing === 'partnerId' || outcome.missing === 'playerId') {
                    if (await this.client.canEditPackageSettings()) {
                        await this.client.showPackageSettingsModal();
                        // Re-read config and retry once after the admin configures settings.
                        const retryConfig = await this.getConfig();
                        const retry = parseKalturaInput(rawInput, retryConfig);
                        if (!isParseError(retry)) {
                            await this.embedAndClose(retry.iframeUrl);
                            return;
                        }
                    }
                }
                this.sendMessage({action: 'error', message: outcome.error});
                return;
            }

            await this.embedAndClose(outcome.iframeUrl);
        } else if (msg['action'] === 'cancel') {
            this.hide();
        }
    }

    private async embedAndClose(iframeUrl: string): Promise<void> {
        const page = new Viewport(this.client).getCurrentPage();
        if (!page) {
            this.sendMessage({
                action: 'error',
                message: 'Could not find an active board to add the video to. Try again from a board.',
            });
            return;
        }
        try {
            await page.importLinks([iframeUrl]);
        } catch {
            this.sendMessage({
                action: 'error',
                message: 'Something went wrong adding the video to the board. Please try again.',
            });
            return;
        }
        this.hide();
    }
}
