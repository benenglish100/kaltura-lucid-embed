import {
    EditorClient,
    LinkUnfurlBlockProxy,
    Menu,
    UnfurlDetails,
    UnfurlIframeAspectRatio,
} from 'lucid-extension-sdk';
import {KalturaConfig, ParseResult, isParseError, parseKalturaInput} from './kalturaparser';
import {PasteModal} from './pastemodal';
import {KALTURA_ICON_DATA_URI} from './icon';
import {fetchEntryMetadata} from './kalturametadata';

export class KalturaExtension {
    private readonly openPasteModalAction = 'openKalturaPasteModal';

    /**
     * Domains we watch for pasted URLs. We only handle self-contained Kaltura *player* URLs
     * (the src of an embed code), which live on the player CDN. Bare MediaSpace links are not
     * handled yet — resolving them correctly requires an oEmbed lookup (a later, network-based
     * path), so we deliberately do not register *.mediaspace.kaltura.com here.
     */
    private readonly unfurlDomains: string[] = [
        'kaltura.com',
        '*.kaltura.com',
    ];

    constructor(private readonly client: EditorClient) {}

    public init(): void {
        // Bonus path: catch Kaltura URLs pasted directly onto the canvas.
        this.unfurlDomains.forEach((domain) =>
            this.client.registerUnfurlHandler(domain, {
                unfurlCallback: (url: string) => this.performUnfurl(url),
                afterUnfurlCallback: (blockProxy, url) => this.enrichUnfurl(blockProxy, url),
            }),
        );

        // Primary path: a one-click button in the Lucidspark content dock.
        this.client.registerAction(this.openPasteModalAction, () => {
            const modal = new PasteModal(this.client, () => this.getConfig());
            modal.show();
        });

        new Menu(this.client).addContentDockMenuItem({
            label: 'Kaltura Video',
            iconUrl: KALTURA_ICON_DATA_URI,
            action: this.openPasteModalAction,
        });
    }

    /** Read the account-wide package settings that supply partner ID and default player. */
    private async getConfig(): Promise<KalturaConfig> {
        const settings = await this.client.getPackageSettings();
        return {
            partnerId: asString(settings.get('partnerId')),
            defaultPlayerId: asString(settings.get('defaultPlayerId')),
            playerDomain: asString(settings.get('playerDomain')),
        };
    }

    /**
     * Called when a matching URL is pasted onto the canvas. Turns the URL into a
     * playable Kaltura iframe block, or returns undefined to let other handlers try.
     */
    private async performUnfurl(url: string): Promise<UnfurlDetails | undefined> {
        const config = await this.getConfig();
        const outcome = parseKalturaInput(url, config);
        if (isParseError(outcome)) {
            // Silently decline: undefined means "not something this extension handles".
            return undefined;
        }
        const title = outcome.title ?? 'Kaltura Video';
        return {
            // Empty so no "Kaltura" attribution line shows under the title on the card.
            providerName: '',
            providerFaviconUrl: KALTURA_ICON_DATA_URI,
            unfurlTitle: title,
            // Show the real video frame as the card preview instead of a blank grey box.
            previewImageUrl: outcome.thumbnailUrl,
            thumbnails: [{url: outcome.thumbnailUrl, width: 640, height: 360}],
            iframe: {
                iframeUrl: outcome.iframeUrl,
                aspectRatio: UnfurlIframeAspectRatio.SixteenToNine,
                iframeTitle: title,
            },
        };
    }

    /**
     * Runs after the card is on the canvas. Fetches the real entry metadata (title, description)
     * from Kaltura and updates the block. Kept out of performUnfurl so the card appears instantly;
     * this slower network step just enriches it. All failures are non-fatal.
     */
    private async enrichUnfurl(blockProxy: LinkUnfurlBlockProxy, url: string): Promise<void> {
        const config = await this.getConfig();
        const outcome = parseKalturaInput(url, config);
        if (isParseError(outcome)) {
            return;
        }
        const parsed: ParseResult = outcome;
        const metadata = await fetchEntryMetadata(this.client, {
            partnerId: parsed.partnerId,
            entryId: parsed.entryId,
            widgetId: parsed.widgetId,
            playerDomain: config.playerDomain || 'cdnapisec.kaltura.com',
        });
        if (!metadata) {
            return;
        }
        if (metadata.title) {
            blockProxy.setTitle(metadata.title);
        }
        if (metadata.description) {
            blockProxy.setDescription(metadata.description);
        }
    }
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
