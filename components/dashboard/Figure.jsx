"use client";

import NumberFlow from "@number-flow/react";

/**
 * A dashboard figure that rolls to its new value (spec section 15,
 * odometer figures).
 *
 * Two rules the spec is explicit about, and both are about restraint:
 *
 *  - it rolls **when the data changes, not on every page load**. The
 *    component is told the value and animates only when that value moves,
 *    which is what `NumberFlow` does by default once it is mounted;
 *  - `respectMotionPreference` is on, so somebody who has asked their
 *    computer for less movement is simply shown the number.
 *
 * Indian grouping comes from the same `en-IN` formatter as everywhere
 * else, so a rolling figure and a printed one never disagree about where
 * the commas go.
 */

/** @param {{value: number, paise?: boolean, className?: string}} props */
export default function Figure({ value, paise = false, className = "" }) {
  if (paise) {
    return (
      <NumberFlow
        value={(value ?? 0) / 100}
        locales="en-IN"
        format={{
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }}
        respectMotionPreference
        className={className}
      />
    );
  }

  return (
    <NumberFlow
      value={value ?? 0}
      locales="en-IN"
      respectMotionPreference
      className={className}
    />
  );
}
