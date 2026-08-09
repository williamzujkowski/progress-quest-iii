import type { SocialSeat } from './socialCatalog';

/**
 * Chat that is not about the hero.
 *
 * Measured over thirty simulated minutes, all 435 scenes were triggered by something the player
 * did. That is the property that makes the feed read as a caption track rather than a channel: real
 * guild chat is overwhelmingly not about the person reading it, and an event-anchored line only
 * feels like an interruption if there is something for it to interrupt.
 *
 * The lines are grouped by seat and written from that seat's `preoccupation` — attendance, prices,
 * quorum, blame allocation. Those columns were declared on every persona and read by nothing, which
 * made them a standing question about whether the cast was a real contract or decoration. They are
 * the contract; this is what they are for.
 *
 * Register rules held to throughout, and they are as much about restraint as about jokes:
 *
 * - No line explains the line before it. Agreement is the weakest possible second beat.
 * - Roughly a quarter carry no joke at all. "back" and "Kettle." are what make the others
 *   detectable as jokes; a channel where every utterance is a polished aphorism reads as generated
 *   however good each aphorism is.
 * - The paired-modifier construction — "emotionally complete and legally decorative" — is the best
 *   move in this project's kit and is already a fingerprint at its current density. None here.
 * - Nothing describes the institution from outside. The cast acts inside the bureaucracy; it never
 *   characterises it.
 * - Nothing acknowledges an observer, unattended time, or the genre.
 * - No figures. An ambient line citing a number would be asserting state nothing computed.
 */

/**
 * The channels ambient chatter uses. Structurally the subset of `SocialChannel` that fits.
 *
 * Narrow on purpose, and the test of what belongs is not "would it be funny" but "is it true". A
 * raid line outside a raid claims a raid is happening; an ambient whisper claims the reader is
 * seeing somebody's private message. Both are assertions about the world that are false, and both
 * stay out however good the joke would be — a mistell that wanted `whisper` was rewritten to fit
 * rather than the type widened to admit it.
 *
 * `system` passes that test where those two fail. A system notice asserts no second person, no
 * private conversation, and no audience at all: it is the institution talking to nobody, which is
 * this game's premise rather than a claim about it. It already exists in `SocialChannel` with a
 * label and a muted colour, and it reaches a register — the message of the day, the scheduled
 * unavailability, the maintenance that found nothing to maintain — that the feed could not otherwise
 * produce at any price.
 */
export type AmbientChannel = 'guild' | 'world' | 'party' | 'system';

export interface AmbientLine {
  readonly seat: SocialSeat;
  readonly channel: AmbientChannel;
  readonly text: string;
}

/**
 * The hall, the paperwork, and the institution — connected to nothing the hero did.
 *
 * The largest lane on purpose. It is the one that establishes the channel exists independently of
 * the player, which is what the whole redesign turns on.
 */
export const AMBIENT_LINES: readonly AmbientLine[] = [
  // official — attendance, and the scope of things
  { seat: 'official', channel: 'guild', text: 'Attendance is being recorded whether or not anything is being attended.' },
  { seat: 'official', channel: 'guild', text: 'The register now has a column for people who were nearly here.' },
  { seat: 'official', channel: 'guild', text: 'Two apologies for absence arrived from the same person, four hours apart.' },
  { seat: 'official', channel: 'guild', text: 'Scope has been clarified. It is now larger.' },
  { seat: 'official', channel: 'guild', text: 'The form asking why the form was needed has been approved.' },
  { seat: 'official', channel: 'guild', text: 'Minutes of the meeting about the minutes remain outstanding.' },
  { seat: 'official', channel: 'guild', text: 'Noted.' },
  { seat: 'official', channel: 'guild', text: 'Tomorrow’s briefing has moved to yesterday for scheduling reasons.' },

  // logistics — provenance, and prices
  { seat: 'logistics', channel: 'guild', text: 'The cabinet marked Miscellaneous has been reclassified as Miscellaneous.' },
  { seat: 'logistics', channel: 'guild', text: 'Someone has filed a complaint about the filing.' },
  { seat: 'logistics', channel: 'world', text: 'Prices are stable. This is not the same as prices being correct.' },
  { seat: 'logistics', channel: 'guild', text: 'The valuation hat is missing. Valuations continue.' },
  { seat: 'logistics', channel: 'guild', text: 'A crate arrived addressed to the previous quartermaster.' },
  { seat: 'logistics', channel: 'guild', text: 'Nothing in the annexe is stolen. Several things are unexplained.' },
  { seat: 'logistics', channel: 'guild', text: 'Logged.' },
  { seat: 'logistics', channel: 'guild', text: 'There is a form for this. There is not a form for finding the form.' },

  // field — quorum, and routes
  { seat: 'field', channel: 'party', text: 'Muster at the usual hour.' },
  { seat: 'field', channel: 'party', text: 'The usual hour has been usual for some time now.' },
  { seat: 'field', channel: 'party', text: 'The corridor outside the armoury is shorter than the map permits.' },
  { seat: 'field', channel: 'party', text: 'I have found a shortcut. It is a shortcut.' },
  { seat: 'field', channel: 'party', text: 'Readiness is high. Attendance is the outstanding item.' },
  { seat: 'field', channel: 'guild', text: 'The north wall of the hall is now considered decorative.' },
  { seat: 'field', channel: 'party', text: 'back' },
  { seat: 'field', channel: 'party', text: 'afk, kettle' },

  // support — morale, and blame
  { seat: 'support', channel: 'guild', text: 'Morale was surveyed. Three responses, all from the same clipboard.' },
  { seat: 'support', channel: 'guild', text: 'The kettle is under review.' },
  { seat: 'support', channel: 'guild', text: 'Blame for the ceiling has been provisionally assigned to the ceiling.' },
  { seat: 'support', channel: 'guild', text: 'I have been asked to stop describing the ledger as haunted.' },
  { seat: 'support', channel: 'guild', text: 'Payroll has been informed that none of us are paid. Payroll disputes this.' },
  { seat: 'support', channel: 'guild', text: 'Someone laminated the fire exit map. The exit remains unlaminated.' },
  { seat: 'support', channel: 'guild', text: 'Kettle.' },
  { seat: 'support', channel: 'guild', text: 'Received.' },
];

/**
 * The same advertisement, from the same seat, on and on.
 *
 * The one lane where repetition is the joke rather than the failure. A trade channel that varied its
 * spam would be less true, not more — and it converts the corpus's worst measured property into its
 * most authentic one.
 */
export const TRADE_LINES: readonly AmbientLine[] = [
  { seat: 'logistics', channel: 'world', text: 'WTS surplus. Reasonable offers considered. Unreasonable offers considered longer.' },
  { seat: 'logistics', channel: 'world', text: 'WTB anything filed under Miscellaneous. Paying in gold and, if pressed, gratitude.' },
  { seat: 'official', channel: 'world', text: 'Recruiting. We have a hall, a ledger, and one member.' },
  { seat: 'field', channel: 'world', text: 'LF one to carry things. No experience required or, historically, present.' },
  { seat: 'logistics', channel: 'world', text: 'Still selling. The surplus has not improved with age. Neither has the offer.' },
];

/**
 * The institution addressing nobody in particular, on a schedule, whether or not anything happened.
 *
 * The register the feed could not reach. Every other lane is somebody speaking; this is the building
 * speaking, and it is the only channel in the game with no author. Flat, impersonal, and repeated
 * regardless of events, which is exactly what a server notice is.
 *
 * Spoken by `system` rather than by a seat. The cast is people, and attributing a scheduled
 * downtime notice to a named clerk would make it a remark rather than a notice — which is the whole
 * distinction the channel exists for.
 */
export const SYSTEM_NOTICES: readonly AmbientLine[] = [
  { seat: 'official', channel: 'system', text: 'Message of the day: unchanged.' },
  { seat: 'official', channel: 'system', text: 'The ledger will be unavailable during the window in which it is consulted.' },
  { seat: 'official', channel: 'system', text: 'Maintenance completed. Nothing was found to maintain.' },
  { seat: 'official', channel: 'system', text: 'This notice is being read aloud in every hall simultaneously, including the empty ones.' },
  { seat: 'official', channel: 'system', text: 'Scheduled downtime has been rescheduled. The new time is also the old time.' },
  { seat: 'official', channel: 'system', text: 'All systems nominal. The systems have not been asked.' },
];

/**
 * The auction channel, which is a different rhythm from a trade advertisement.
 *
 * `TRADE_LINES` already carries the long advertisement and already understands that repetition is
 * the joke rather than the failure. What it does not carry is the channel's *forms* — the price
 * check, the bump, the repost, the undercut, the thing offered free that nobody takes. Those are
 * distinct utterances rather than variations on an advertisement, and half of them are two words
 * long, so they belong in a bank of their own.
 *
 * On `world`, not on a channel of its own. A `SocialChannel` value is a claim about who can hear a
 * line, and `world` already means a broadcast not scoped to guild or party — the audience of an
 * auction is that same audience. What made the tunnel legible was never the prefix; it was `WTS`,
 * `PC`, `up`, `obo`, and the same line again forty seconds later.
 *
 * The scheduler declines a line whose text is still in `recentTexts`, which is correct here and
 * should be left alone: a bump should read as forty seconds later, not four lines later.
 */
export const AUCTION_LINES: readonly AmbientLine[] = [
  { seat: 'logistics', channel: 'world', text: 'PC on a lot of assorted. It has been assorted for some time.' },
  { seat: 'logistics', channel: 'world', text: 'up' },
  { seat: 'logistics', channel: 'world', text: 'Still up.' },
  { seat: 'official', channel: 'world', text: 'Reposting. The channel moved and took the offer with it.' },
  { seat: 'logistics', channel: 'world', text: 'Undercut. The undercutting party is also me.' },
  { seat: 'field', channel: 'world', text: 'Free to a good home. Free to any home. Free.' },
  { seat: 'logistics', channel: 'world', text: 'WTB nothing in particular. Paying above the odds for it.' },
  { seat: 'field', channel: 'world', text: 'LF group for anything. Will travel. Have travelled.' },
  { seat: 'official', channel: 'world', text: 'Offer withdrawn pending valuation. Valuation withdrawn pending offer.' },
];

/**
 * One to three words, which is the most common utterance in any real channel and was zero per cent
 * of this one.
 *
 * Fixes the word-count distribution structurally rather than by sampling for it: the corpus sat in a
 * tight band around nine words with no tail in either direction, and no amount of rewriting the long
 * lines produces a short one. Mixing chat-isms with clerical monosyllables is the register collision
 * in two words instead of thirty.
 */
export const REACTION_LINES: readonly AmbientLine[] = [
  { seat: 'field', channel: 'guild', text: 'grats' },
  { seat: 'support', channel: 'guild', text: 'gz' },
  { seat: 'official', channel: 'guild', text: 'Noted with concern.' },
  { seat: 'official', channel: 'guild', text: 'Seconded.' },
  { seat: 'logistics', channel: 'guild', text: 'Not my department.' },
  { seat: 'support', channel: 'guild', text: 'Again?' },
  { seat: 'official', channel: 'guild', text: 'Motion carries.' },
  { seat: 'logistics', channel: 'guild', text: 'Circulate it.' },
  { seat: 'support', channel: 'guild', text: 'Abstain.' },
  { seat: 'field', channel: 'party', text: 'wb' },
];

/**
 * A disagreement about the intake sheet, in order, for ever.
 *
 * Beats advance with `completedTasks` and wrap, which is the honest shape — a feud that restarts is
 * truer than one that concludes, and it means the bit rewards watching for an hour without ever
 * needing a payoff. The stakes shrink as the register escalates, which is the whole joke.
 */
export const FEUD_BEATS: readonly AmbientLine[] = [
  { seat: 'logistics', channel: 'guild', text: 'The intake sheet is not optional.' },
  { seat: 'official', channel: 'guild', text: 'The intake sheet is not enforceable.' },
  { seat: 'logistics', channel: 'guild', text: 'I have added a box to the intake sheet.' },
  { seat: 'official', channel: 'guild', text: 'I have not read the new box.' },
  { seat: 'logistics', channel: 'guild', text: 'The box is mandatory.' },
  { seat: 'official', channel: 'guild', text: 'The box is aspirational.' },
  { seat: 'logistics', channel: 'guild', text: 'I have escalated the box.' },
  { seat: 'official', channel: 'guild', text: 'The escalation has been filed in the box.' },
];

/**
 * The seat everybody needs and nobody thanks, in order, for ever.
 *
 * The oldest joke in raiding, and it is already this game's joke about the hero told about somebody
 * else. A utility class is brought because the run does not work without it, then blamed for the
 * wipe, then left off the credit — and the person doing it keeps turning up. Anyone who played a
 * bard, an enchanter, or a shaman recognises the shape immediately; anyone who did not still reads
 * it as an office.
 *
 * Requests escalate, acknowledgement never arrives, and the bit wraps rather than resolving — the
 * same form the intake-sheet feud uses, and for the same reason. A thank-you at the end would be a
 * payoff, and the absence of one is the content.
 *
 * No class names and no character names. The joke is structural, so it survives being about a seat
 * rather than about a bard, and the tables are asserted to name no real person.
 */
export const UTILITY_BEATS: readonly AmbientLine[] = [
  { seat: 'field', channel: 'guild', text: 'Can support bring the thing again.' },
  { seat: 'support', channel: 'guild', text: 'Support has brought the thing.' },
  { seat: 'field', channel: 'guild', text: 'Can support bring the thing to the other one as well.' },
  { seat: 'support', channel: 'guild', text: 'Support is bringing the thing to both.' },
  { seat: 'official', channel: 'guild', text: 'Noting that the run went well. No contributors identified.' },
  { seat: 'field', channel: 'guild', text: 'Support was slightly late with the thing.' },
  { seat: 'support', channel: 'guild', text: 'Support was where the thing was needed.' },
  { seat: 'official', channel: 'guild', text: 'The matter is closed. Support has been thanked in the minutes of a meeting nobody attended.' },
];

/**
 * A question asked into silence, re-asked shorter each time, then filed.
 *
 * Silence becomes content. Nothing ever answers, which is the form working rather than the form
 * failing — and it is the cheapest way to make the channel feel like it has a memory and a future,
 * because something is always outstanding.
 */
export const QUESTION_BEATS: readonly AmbientLine[] = [
  { seat: 'field', channel: 'guild', text: 'Does the guild still own the horse?' },
  { seat: 'field', channel: 'guild', text: 'Raising the horse again.' },
  { seat: 'field', channel: 'guild', text: 'Horse.' },
  { seat: 'field', channel: 'guild', text: 'The horse has been carried forward to the next agenda.' },
  { seat: 'field', channel: 'guild', text: 'The next agenda has been carried forward.' },
];

/**
 * What the guild says about the thing the hero is wearing.
 *
 * `{item}` is replaced with a bare base noun — never a full generated name, which carries an
 * assessor's mark and would put a figure in a bank asserted to contain none. `{slot}` is the slot
 * it sits in.
 *
 * The institution notices the item; the item does not announce itself. That is the register this
 * project's comedy actually runs on — the tenor ladder, the legendary remarks and the feud beats all
 * work that way — and an item expressing a property of itself would read as a stat.
 */
export const ITEM_OF_RECORD_LINES: readonly AmbientLine[] = [
  { seat: 'official', channel: 'guild', text: 'The {item} is now cited in correspondence by default.' },
  { seat: 'official', channel: 'guild', text: 'All filings this quarter reference the {item}. None explain why.' },
  { seat: 'logistics', channel: 'guild', text: 'The {item} has been valued twice, differently, by the same person.' },
  { seat: 'logistics', channel: 'world', text: 'WTB one {item}. I have seen what it does and I remain interested.' },
  { seat: 'field', channel: 'party', text: 'Route planning now assumes the {item}. It did not consent.' },
  { seat: 'support', channel: 'guild', text: 'Morale is attributed to the {item}, provisionally and without evidence.' },
  { seat: 'official', channel: 'guild', text: 'The {item} attended in the {slot} capacity and was minuted.' },
  { seat: 'support', channel: 'guild', text: 'I have stopped asking what the {item} is for.' },
];

/**
 * The name on the docket, said by somebody who has stopped pretending it is a stranger.
 *
 * The caseload has counted this since it was written, and it reaches one panel a reader opens
 * occasionally. The watcher, meanwhile, has been seeing that name go past in the activity log for an
 * hour — which is what makes this the cheapest payoff in the project: the joke is already set up,
 * by the game, at length, and nobody has ever cashed it.
 *
 * The register is reclassification. Not "the hero has killed many gnolls" — a tally the panel
 * already gives better — but an institution that has quietly moved an adversary into the column
 * marked colleague and filled in the forms accordingly. Nobody involved finds this strange.
 *
 * No count, ever. `mostLitigated` returns one and it is the thing that would turn the colleague back
 * into a statistic: "filed against forty times" is a number, "still no reply" is a person.
 */
export const DOCKET_LINES: readonly AmbientLine[] = [
  { seat: 'logistics', channel: 'guild', text: 'I have put {docket} on the standing distribution. It has not asked to be removed.' },
  { seat: 'logistics', channel: 'guild', text: 'Correspondence with {docket} is now handled as routine rather than as incident.' },
  { seat: 'official', channel: 'guild', text: 'The file on {docket} has been reclassified from adversary to recurring party.' },
  { seat: 'official', channel: 'guild', text: 'A desk has been allocated to {docket}, pending clarification of the reason.' },
  { seat: 'support', channel: 'guild', text: 'I sent {docket} the agenda out of habit. Still no reply.' },
  { seat: 'field', channel: 'party', text: 'We have met {docket} often enough that I no longer announce it.' },
  { seat: 'logistics', channel: 'world', text: 'WTB anything {docket} is known to want. Enquiries have gone unanswered.' },
  { seat: 'official', channel: 'guild', text: 'Nobody has raised {docket} at review, and review is where things are raised.' },
];

/**
 * The finest thing the ledger has ever recorded, cited by people who have never seen it.
 *
 * Distinct from the item lane next door, and the distinction is the point: that one cites what the
 * hero is wearing now, this cites a benchmark from a ledger that spans every character the file has
 * ever held. Equipment is never sold — it vanishes by being overwritten, a better breastplate
 * replacing the one in the slot — and `commendations.exhibit` is the only thing anywhere that
 * remembers it existed.
 *
 * What these may not say is what became of it. The ledger records a name, a slot and a quality, and
 * nothing at all about where the thing is or who wore it — the same restraint the predecessor
 * citation keeps, for the same reason: a line inventing an ending is inventing a fact. So the joke
 * is a standard nobody can produce rather than a relic somebody lost.
 */
export const EXHIBIT_LINES: readonly AmbientLine[] = [
  { seat: 'official', channel: 'guild', text: 'The standard for the {exhibitSlot} is still the {exhibit}. The standard has not been revised.' },
  { seat: 'official', channel: 'guild', text: 'The {exhibit} remains the finest {exhibitSlot} on file. The file does not say where it is.' },
  { seat: 'logistics', channel: 'guild', text: 'Procurement continues to reference the {exhibit}. Procurement has not been asked to produce it.' },
  { seat: 'logistics', channel: 'world', text: 'WTB anything approaching the {exhibit}. I am told this is unrealistic.' },
  { seat: 'support', channel: 'guild', text: 'Every {exhibitSlot} is assessed against the {exhibit}. Nobody has enjoyed this.' },
  { seat: 'field', channel: 'party', text: 'I have heard about the {exhibit}. I have not seen the {exhibit}.' },
];

/**
 * The same adjective, in three places at once.
 *
 * `loadoutFiling` has found this since it was written — bases cannot collide any more, but modifiers
 * are drawn from one shared list, so a hero in three `Bonded` things is ordinary rather than exotic
 * — and it reached exactly one surface, a line in the world console nobody watches. The channel is
 * the thing people actually watch, and it had nothing to say about it.
 *
 * Never as an achievement, which is the filing's own rule and matters more here than there: the
 * moment a repeated modifier reads as a set to pursue, the joke becomes a spreadsheet the player is
 * forbidden to fill in. So these are all the institution noticing a coincidence and declining to do
 * anything about it.
 *
 * No count. The filing knows how many slots, and the bank is asserted to state no figures — and the
 * number is not the funny part anyway. "More places than the form has boxes for" is.
 */
export const REPEATED_MODIFIER_LINES: readonly AmbientLine[] = [
  { seat: 'official', channel: 'guild', text: 'The hero is {modifier} in more places than the form has boxes for.' },
  { seat: 'official', channel: 'guild', text: 'Several entries read {modifier}. The register has recorded this without comment.' },
  { seat: 'logistics', channel: 'guild', text: 'Stock came back {modifier} again. The supplier was not asked and has not offered.' },
  { seat: 'logistics', channel: 'world', text: 'Anyone else holding {modifier} goods. Asking for the inventory.' },
  // Never sentence-initial. The substitution is lower-cased on the way in, because these are
  // adjectives mid-sentence and the filing holds them capitalised the way an item name carries
  // them — a line that opened on one would open on a lower-case word.
  { seat: 'support', channel: 'guild', text: 'I have stopped writing {modifier} out in full.' },
  { seat: 'field', channel: 'party', text: 'Everything the hero owns is {modifier}. It has not come up.' },
];

/**
 * A slot held responsible, in order, for ever.
 *
 * The support seat's declared preoccupation is blame allocation, and this is that preoccupation
 * given something to be about. It wraps rather than resolving, which is the honest shape — the
 * escalation shrinks in stakes as it grows in register, and then begins again.
 */
export const BLAME_BEATS: readonly AmbientLine[] = [
  { seat: 'support', channel: 'guild', text: 'The {slot} is the problem.' },
  { seat: 'support', channel: 'guild', text: 'I have been asked to specify which {slot}.' },
  { seat: 'support', channel: 'guild', text: 'The {slot}.' },
  { seat: 'support', channel: 'guild', text: 'Blame for the {slot} has been provisionally accepted by the {slot}.' },
  { seat: 'support', channel: 'guild', text: 'The {slot} matter is closed. It is also ongoing.' },
];

/**
 * The hall, as explained to somebody who has just arrived.
 *
 * The register shift the effects design argued for, in place of an accent. An accent is a different
 * joke, it degrades over hundreds of repetitions, and it is hostile to a screen reader; a register
 * shift does the same work in this project's own voice and gets funnier the longer it runs.
 *
 * Reached only while the best thing the hero owns is entry-tier — a `Lanyard`, a `Cover Note`, a
 * `Desk Space`. The joke is that the worst loadout in the game has the loudest voice, and that a
 * brand-new player meets an equipment effect within two minutes of starting, which nothing else in
 * the feed manages. It stops on its own the moment anything better is equipped, so it cannot outstay
 * its welcome.
 */
export const ONBOARDING_LINES: readonly AmbientLine[] = [
  { seat: 'official', channel: 'guild', text: 'Welcome. Your access has been provisioned at the level you already had.' },
  { seat: 'official', channel: 'guild', text: 'Please complete the induction. The induction is this sentence.' },
  { seat: 'logistics', channel: 'guild', text: 'Your workstation is wherever you are standing when somebody needs you.' },
  { seat: 'support', channel: 'guild', text: 'Someone will be assigned to you shortly. They will also be you.' },
  { seat: 'field', channel: 'party', text: 'The tour covers the fire exits. There is one fire exit and it is decorative.' },
  { seat: 'official', channel: 'guild', text: 'Your probation ends automatically and nobody is notified.' },
  { seat: 'support', channel: 'guild', text: 'Any questions can be raised at the meeting, which was yesterday.' },
  { seat: 'logistics', channel: 'guild', text: 'Kit issued: one. Kit expected: one. Kit reconciled: pending.' },
];

/**
 * Two people talking to each other, with the hero not in the room.
 *
 * The measured feed had the hero in every third line and the cast addressing them in the other two.
 * A channel where every exchange includes the person reading it is a caption track with more
 * speakers, and the fastest way to make a room feel populated is to let it carry on without them.
 *
 * Each exchange is a complete unit and is emitted whole, which is the one place the ambient lane
 * says more than one thing at a time. Two lines is the shape a real exchange usually has: somebody
 * asks, somebody answers, and the channel moves on. None of them resolves anything.
 */
/**
 * A line that went to the wrong channel, and the correction that follows it.
 *
 * The joke only became tellable when the panel started showing the channel. One blended stream with
 * a coloured prefix per line is how this genre has always rendered chat, and it is also what makes a
 * mistell legible: the reader sees `[Raid]` on a remark about a sandwich before anybody says a word
 * about it. A filtered feed showing one channel at a time could not have carried this at all.
 *
 * The correction always lands on a different channel from the slip, which is how it actually
 * happens and which means the two prefixes disagree on screen. That disagreement is the gag, and it
 * is carried by the layout rather than by the words.
 *
 * Kept inside `AmbientChannel` — guild, world and party. `raid` and `whisper` would have been the
 * sharper jokes and are deliberately not in that type: raid chatter outside a raid and a private
 * whisper arriving in the ambient stream are both claims about the world that are not true. Widening
 * the type for a better punchline would have been paying for a joke with a lie.
 *
 * Nobody is embarrassed. An institution that mistells and then files a correction is funnier than a
 * person who apologises, and it keeps the cast from acquiring feelings the game does not model.
 */
export const MISTELLS: readonly (readonly AmbientLine[])[] = [
  [
    { seat: 'logistics', channel: 'world', text: 'Bringing the sandwich. Do not wait.' },
    { seat: 'logistics', channel: 'guild', text: 'The sandwich notice was intended for a smaller audience.' },
  ],
  [
    { seat: 'support', channel: 'world', text: 'He does this every single quarter and everyone pretends not to notice.' },
    { seat: 'support', channel: 'party', text: 'That was meant for three people. It reached rather more.' },
  ],
  [
    { seat: 'official', channel: 'party', text: 'Approved, but only because I stopped reading.' },
    { seat: 'official', channel: 'guild', text: 'The previous remark has been reclassified as internal.' },
  ],
  [
    { seat: 'field', channel: 'party', text: 'Train to the annexe. Sorry. Sorry.' },
    { seat: 'field', channel: 'world', text: 'The warning has been reissued to the people it concerned.' },
  ],
  [
    { seat: 'logistics', channel: 'guild', text: 'I have not been paid since the reorganisation.' },
    { seat: 'logistics', channel: 'party', text: 'Please disregard the guild-wide salary enquiry.' },
  ],
];

/**
 * Somebody is still posting to the hero who held this file three characters ago.
 *
 * The mistell mechanism already shipped, and it is exactly the right shape borrowed for exactly the
 * wrong mistake. A shipped mistell is a message that went to the wrong *channel* and is retracted a
 * beat later. This is a message that went to the wrong *person* — somebody who has not been on file
 * for three characters — and the retraction fixes the channel, or the location, or the timing.
 *
 * Nobody corrects the name. That is the whole joke and it is why these must stay two-beat units: a
 * single line naming a predecessor is a mistake, and a mistake followed by a scrupulous correction
 * of something else is an institution.
 *
 * Third person throughout. The room talks *about* the predecessor as though they were down the
 * corridor, which is funnier than talking to them and keeps every line clear of a second person a
 * watcher could mistake for themselves.
 *
 * Dead until the roster holds two characters, which is the honest condition — `predecessorFor`
 * returns null for a fresh save and this lane falls back with it.
 */
export const PREDECESSOR_MISTELLS: readonly (readonly AmbientLine[])[] = [
  [
    { seat: 'logistics', channel: 'guild', text: "{predecessor}'s requisition is ready for collection." },
    { seat: 'logistics', channel: 'guild', text: 'Correction: ready for collection at the annexe.' },
  ],
  [
    { seat: 'official', channel: 'party', text: '{predecessor} should take the left approach here.' },
    { seat: 'official', channel: 'guild', text: 'That was routing advice and belonged in the party channel. It reached it.' },
  ],
  [
    { seat: 'support', channel: 'guild', text: 'Has anyone heard back from {predecessor} about the forms.' },
    { seat: 'support', channel: 'guild', text: 'Withdrawn. I have found the forms.' },
  ],
  [
    { seat: 'field', channel: 'party', text: '{predecessor} knows this route better than I do.' },
    { seat: 'field', channel: 'party', text: 'I will ask them when they are next available.' },
  ],
  [
    { seat: 'logistics', channel: 'world', text: 'WTS the set {predecessor} was collecting. No rush.' },
    { seat: 'logistics', channel: 'guild', text: 'Apologies for the world channel. The offer stands.' },
  ],
];

export const EXCHANGES: readonly (readonly AmbientLine[])[] = [
  /*
   * Loot drama, which is the oldest argument in raiding and belongs here rather than in a lane of
   * its own.
   *
   * The obvious build was a `loot` lane. The rotation is already fourteen distinct kinds across
   * nineteen slots, and another running bit would have taken weight from the ones already there
   * rather than adding to them — while the measurement that actually mattered said something else:
   * ambient is 43.8% of what is on screen at any moment and reuses each line 2.5 times, which is now
   * the highest reuse in the feed. Deepening a bank costs no lane weight and lowers that directly.
   *
   * All four are exchanges because loot drama is not an announcement — it is two people disagreeing
   * about a rule nobody wrote down. Nothing here names an item or a figure: an ambient line citing
   * either would assert state nothing computed, and the whole bit works better when the object is
   * never identified.
   */
  [
    { seat: 'official', channel: 'guild', text: 'Who is holding the loot?' },
    { seat: 'logistics', channel: 'guild', text: 'The person who went offline.' },
  ],
  [
    { seat: 'support', channel: 'guild', text: 'That was an off-spec need.' },
    { seat: 'field', channel: 'guild', text: 'It is my spec on the days I need it.' },
  ],
  [
    { seat: 'logistics', channel: 'guild', text: 'It dropped again.' },
    { seat: 'support', channel: 'guild', text: 'Nobody has ever taken it.' },
    { seat: 'logistics', channel: 'guild', text: 'It will drop again.' },
  ],
  [
    { seat: 'field', channel: 'party', text: 'Has the thing we came for ever dropped?' },
    { seat: 'official', channel: 'party', text: 'The register says it is obtainable.' },
    { seat: 'field', channel: 'party', text: 'That is not the same answer.' },
  ],
  [
    { seat: 'logistics', channel: 'world', text: 'Sold.' },
    { seat: 'official', channel: 'world', text: 'To whom?' },
    { seat: 'logistics', channel: 'world', text: 'The channel.' },
  ],
  [
    { seat: 'official', channel: 'guild', text: 'Did you sign the intake sheet?' },
    { seat: 'logistics', channel: 'guild', text: 'I initialled it, which is legally similar.' },
  ],
  [
    { seat: 'field', channel: 'party', text: 'Muster at the usual hour.' },
    { seat: 'support', channel: 'party', text: 'The usual hour has moved and kept its name.' },
  ],
  [
    { seat: 'logistics', channel: 'guild', text: 'Who has the key to the annexe?' },
    { seat: 'official', channel: 'guild', text: 'The annexe has the key to the annexe.' },
  ],
  [
    { seat: 'support', channel: 'guild', text: 'If it goes wrong, whose is it?' },
    { seat: 'official', channel: 'guild', text: 'Yours. It was pre-assigned in the spring.' },
  ],
  [
    { seat: 'field', channel: 'party', text: 'Is this the same cart as last time?' },
    { seat: 'logistics', channel: 'party', text: 'It is the same cart. It has a new number.' },
  ],
  [
    { seat: 'official', channel: 'guild', text: 'I have drafted the objectives.' },
    { seat: 'support', channel: 'guild', text: 'Drafted, or written?' },
    { seat: 'official', channel: 'guild', text: 'Drafted.' },
  ],
  [
    { seat: 'logistics', channel: 'guild', text: 'The kettle is a shared asset.' },
    { seat: 'support', channel: 'guild', text: 'Then I share it more than anyone.' },
  ],
  [
    { seat: 'field', channel: 'party', text: 'I found a shortcut.' },
    { seat: 'official', channel: 'party', text: 'Is it shorter?' },
    { seat: 'field', channel: 'party', text: 'It is a shortcut.' },
  ],
];

