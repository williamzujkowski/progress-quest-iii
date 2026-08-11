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
 * The spoken form is unchanged — a screen reader reads grouped digits correctly, so there is nothing
 * for the `sr-only` twin to fix and adding one would say the number twice.
 */
export const CurrencyNumber: React.FC<{ value: number }> = ({ value }) => (
  <span className="game-number">{formatCurrency(value)}</span>
);

export const ActLabel: React.FC<{ act: number }> = ({ act }) => act === 0
  ? <>Prologue</>
  : <>Act{' '}<GameNumber value={act} /></>;
