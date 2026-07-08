import { createHash } from 'node:crypto';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringAt(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null || !(key in current)) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function findEmail(value: unknown, depth = 0): string {
  if (depth > 6 || value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return emailRegex.test(trimmed) ? trimmed : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmail(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  const object = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(object)) {
    if (key.toLowerCase().includes('email')) {
      const found = findEmail(item, depth + 1);
      if (found) return found;
    }
  }
  for (const item of Object.values(object)) {
    const found = findEmail(item, depth + 1);
    if (found) return found;
  }
  return '';
}

function normaliseEventType(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function extractCalendarInviteeEmail(body: unknown) {
  const candidates = [
    ['payload', 'email'],
    ['payload', 'invitee', 'email'],
    ['payload', 'attendee', 'email'],
    ['payload', 'attendees', '0', 'email'],
    ['payload', 'responses', 'email', 'value'],
    ['payload', 'booking', 'attendees', '0', 'email'],
    ['payload', 'booking', 'user', 'email'],
    ['data', 'attendees', '0', 'email'],
    ['data', 'booking', 'attendees', '0', 'email'],
    ['email'],
    ['invitee', 'email'],
    ['attendee', 'email'],
  ];

  for (const path of candidates) {
    const value = stringAt(body, path);
    if (emailRegex.test(value.trim().toLowerCase())) {
      return value.trim().toLowerCase();
    }
  }

  return findEmail(body);
}

export function extractCalendarEventType(body: unknown) {
  return [
    stringAt(body, ['event']),
    stringAt(body, ['type']),
    stringAt(body, ['triggerEvent']),
    stringAt(body, ['event_type']),
    stringAt(body, ['payload', 'event']),
    stringAt(body, ['payload', 'type']),
    stringAt(body, ['payload', 'triggerEvent']),
    stringAt(body, ['data', 'triggerEvent']),
  ].find(Boolean) || '';
}

export function isCalendarBookingEvent(body: unknown) {
  const eventType = normaliseEventType(extractCalendarEventType(body));
  return eventType === 'invitee.created' ||
    eventType === 'invitee_created' ||
    eventType === 'booking_created' ||
    eventType === 'booking.created' ||
    eventType === 'bookingcreated' ||
    eventType === 'booking_requested' ||
    eventType === 'booking.requested' ||
    eventType === 'bookingrequested' ||
    eventType === 'booking_confirmed' ||
    eventType === 'booking.confirmed' ||
    eventType === 'bookingconfirmed';
}

export function calendarEmailFingerprint(email: string) {
  return createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 12);
}
