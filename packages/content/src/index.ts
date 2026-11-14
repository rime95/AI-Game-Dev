import { ContentSchema, type Content } from './schemas';
import chips from '../data/chips.json';
import archs from '../data/archs.json';
import rivals from '../data/rivals.json';
import events from '../data/events.json';
import nodes from '../data/nodes.json';
import license from '../data/license.json';
import funding from '../data/funding.json';
import startups from '../data/startups.json';
import clients from '../data/clients.json';
import hq from '../data/hq.json';
import sites from '../data/sites.json';

export * from './schemas';

/** All game content, validated at load. Throws with a readable path if data is malformed. */
export const content: Content = ContentSchema.parse({ hq, sites, chips, clients, nodes, license, funding, startups, archs, rivals, events });
