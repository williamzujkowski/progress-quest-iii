import React from 'react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { describeEquipment, describeInventoryItem, describeSpell } from '../data/itemDetails';
import { useGameStore } from '../state/gameStore';
import type { EquipSlot } from '../engine/types';

type TooltipProps = (
  | { kind: 'equipment'; name: string; slot: EquipSlot }
  | { kind: 'inventory'; name: string; quantity: number }
  | { kind: 'spell'; name: string; level: number }
) & { children?: React.ReactNode };

/**
 * Closes whichever tooltip is currently open when another opens.
 *
 * Dismissal cannot rest on focus alone. WebKit does not focus a button when it is tapped, so the
 * blur that closes the previous tooltip never arrives there and taps accumulate visible tooltips.
 * A single shared closer is the smallest thing that makes "one at a time" true in every browser
 * rather than only in the ones that focus on click.
 */
let openTooltip: React.RefObject<(() => void) | null> | null = null;

export const ItemTooltip: React.FC<TooltipProps> = (props) => {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number>(undefined);
  const openAtPressRef = useRef(false);
  const hideRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  // Selected narrowly rather than taken from the whole character, because an act changes once
  // every several hours and a tooltip should not re-render on every tick to learn that.
  const act = useGameStore((state) => state.character.Plot.act);
  // Same reasoning as the act above: a scalar rather than the sheet, so a tooltip does not re-render
  // on every tick. Level is what the market prices a stack against.
  const level = useGameStore((state) => state.character.Traits.Level);
  /**
   * Named by its slot, for equipment only.
   *
   * The visible label is the item name, and an unfilled slot shows an em dash — so nine of the
   * eleven equipment triggers on a new character had the accessible name "—", and a keyboard user
   * heard "dash, button" eleven times with nothing distinguishing Helm from Gauntlets. The slot
   * name was present as `sr-only` text in an adjacent `<span>`, which reaches browse mode but is
   * not part of the button's name, so it is absent from focus announcements and from a
   * buttons/forms list entirely.
   *
   * Contains the visible label whenever there is one, so speech input still matches what is on
   * screen (WCAG 2.5.3). An em dash is not a label anybody would speak, so the empty case says so
   * in words instead.
   */
  const accessibleName = props.kind === 'equipment'
    ? `${props.slot}: ${props.name || 'empty'}`
    : undefined;

  const details = props.kind === 'equipment'
    ? describeEquipment(props.name, props.slot, act)
    : props.kind === 'spell'
      ? describeSpell(props.name, props.level)
      : describeInventoryItem(props.name, props.quantity, act, level);

  // Declared before the effects that call it, so no closure reads it before it is initialized. It
  // has no dependencies that change: `setOpen` is stable, and the module-level `openTooltip` and
  // the `hideRef` object are read at call time.
  const hide = useCallback(() => {
    if (openTooltip === hideRef) openTooltip = null;
    setOpen(false);
  }, []);
  // Registered by ref rather than by function, so the shared closer can recognise this tooltip as
  // the open one by identity. The ref object outlives every render this component has. It is
  // assigned in an effect rather than during render, which is where React allows ref writes.
  useEffect(() => {
    hideRef.current = hide;
  }, [hide]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!trigger || !tooltip) return;

      const gap = 8;
      const left = Math.min(Math.max(gap, trigger.left), window.innerWidth - tooltip.width - gap);
      const above = trigger.top - tooltip.height - gap;
      const top = above >= gap ? above : Math.min(window.innerHeight - tooltip.height - gap, trigger.bottom + gap);
      setPosition({ left, top: Math.max(gap, top) });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open, hide]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const show = () => {
    window.clearTimeout(closeTimerRef.current);
    if (openTooltip && openTooltip !== hideRef) openTooltip.current?.();
    openTooltip = hideRef;
    setOpen(true);
  };
  const scheduleHide = () => {
    closeTimerRef.current = window.setTimeout(hide, 100);
  };
  const showFromHover = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') show();
  };
  const hideFromHover = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') scheduleHide();
  };
  const toggleFromPointer = (event: React.MouseEvent) => {
    if (event.detail > 0) setOpen(!openAtPressRef.current);
  };
  const toggleFromKeyboard = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setOpen((current) => !current);
  };

  const tooltip = open ? createPortal(
    <span
      className="item-tooltip item-tooltip-visible"
      id={tooltipId}
      ref={tooltipRef}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
      onPointerEnter={showFromHover}
      onPointerLeave={hideFromHover}
    >
      <strong>{props.name || 'Empty slot'}</strong>
      <span>{details.description}</span>
      <span className="tooltip-effect">{details.effect}</span>
    </span>,
    document.body,
  ) : null;

  return (
    <>
      <button
      type="button"
      className="tooltip-trigger"
      ref={triggerRef}
      aria-controls={open ? tooltipId : undefined}
      aria-describedby={open ? tooltipId : undefined}
      // No aria-expanded. It is for a control that expands a region, and what this controls is a
      // `role="tooltip"` — so "collapsed" promised content that Enter would reveal in place, which
      // is not what happens. On a stocked dashboard that was a spurious word on every one of a
      // hundred-odd rows: "Loot item 1, button, collapsed", eighty times. The describedby wiring
      // below is how the tooltip actually reaches a reader, and it is correct.
      aria-label={accessibleName}
      title={details.description}
      onPointerEnter={showFromHover}
      onPointerLeave={hideFromHover}
      onFocus={show}
      onBlur={hide}
      onPointerDown={() => { openAtPressRef.current = open; }}
      onClick={toggleFromPointer}
      onKeyDown={toggleFromKeyboard}
    >
      <span className="tooltip-trigger-label">{props.children ?? props.name}</span>
      </button>
      {tooltip}
    </>
  );
};
