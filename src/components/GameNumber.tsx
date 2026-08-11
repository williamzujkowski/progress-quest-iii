import React from 'react';
import { describeGameNumber, formatCurrency, formatGameNumber } from '../engine/text';

export const GameNumber: React.FC<{ value: number }> = ({ value }) => {
  const display = formatGameNumber(value);
  const spoken = describeGameNumber(value);
  if (display === spoken) return <span className="game-number">{display}</span>;
  return (
    <span className="game-number" title={`${spoken}. Ordinary notation has been retired for administrative reasons.`}>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
};

/**
 * A currency total, which stays in plain grouped digits far longer than an ordinary figure.
 *
 * Separate from `GameNumber` because the two answer different questions. An act ordinal is an index
 * and reads correctly as `1.00e6`; a gold total is a reward, and the point at which it stops being
 * legible is the point at which it stops being one.
 *
 * Grouped digits need no spoken twin — a screen reader reads `1,158,330` correctly, and adding one
 * would say the number twice. But the fallback past the persisted ceiling is scientific notation,
 * and that emphatically does need one: rendering it bare made a reader announce "one point zero zero
 * e twelve". So the plain case is a plain span and the exponent case delegates to `GameNumber`,
 * which already owns that treatment.
 */
export const CurrencyNumber: React.FC<{ value: number }> = ({ value }) => {
  const plain = formatCurrency(value);
  if (plain !== formatGameNumber(value)) return <span className="game-number">{plain}</span>;
  return <GameNumber value={value} />;
};

export const ActLabel: React.FC<{ act: number }> = ({ act }) => act === 0
  ? <>Prologue</>
  : <>Act{' '}<GameNumber value={act} /></>;
