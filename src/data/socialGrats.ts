import type { SocialSeat } from './socialCatalog';

/**
 * The congratulation that answers a promotion.
 *
 * A level used to be voiced by `official` and `support` alone — `logistics` and `field` had no line
 * in any of the three variants — and the middle line was fixed per variant, so the same two remarks
 * came round for ever.
 *
 * Written per seat, because the joke is that each department congratulates you in its own idiom and
 * none of them is quite about the promotion. `logistics` congratulates the routing table, `field`
 * congratulates the terrain, `support` congratulates the paperwork.
 *
 * Short on purpose. This lands between the announcement and the hero's reply, so a long one would
 * read as a second announcement rather than as somebody agreeing.
 */
export const GRATS: Readonly<Record<Exclude<SocialSeat, 'official'>, readonly string[]>> = {
  logistics: [
    'Congratulations. The new level has been added to the routing table.',
    'Acknowledged, with the standard enthusiasm.',
    'Grats. Your record now sorts differently.',
    'Congratulations. No re-routing is required.',
  ],
  field: [
    'Grats. Nothing out here has been informed.',
    'Well done. The terrain remains unimpressed.',
    'Grats — I will update the map legend when I next have a map.',
    'Congratulations from the field, where it changes nothing.',
  ],
  support: [
    'Congratulations, filed. A card is circulating for signature.',
    'Congratulations. This message was pre-approved for all promotions.',
    'Grats. I have logged the feeling and closed the ticket.',
    'Belated congratulations. The notification queue is deep.',
  ],
};
