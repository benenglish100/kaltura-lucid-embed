import {EditorClient} from 'lucid-extension-sdk';
import {KalturaExtension} from './kalturaextension';

const client = new EditorClient();
new KalturaExtension(client).init();
