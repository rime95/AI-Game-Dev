import { ContentSchema, type Content } from './schemas';
import chips from '../data/chips.json';
import archs from '../data/archs.json';
import rivals from '../data/rivals.json';
import events from '../data/events.json';

export * from './schemas';

/** All game content, validated at load. Throws with a readable path if data is malformed. */
export const content: Content = ContentSchema.parse({ chips, archs, rivals, events });
