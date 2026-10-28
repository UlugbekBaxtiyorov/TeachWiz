import { preparationCategories, skillLevels, instructionLanguages, deliveryModes } from '../public/catalog-options.js';
import { profileFields, profileInput, fee } from './listing-profile.js';

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !allowed.includes(key))) fail('Send only the supported fields.');
}

function text(value, label, max, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = value.trim();
  if ((required && !result) || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(result)) {
    fail(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
  }
  return result;
}

export function applicationInput(body) {
  fields(body, ['providerType', 'providerName', 'contactDetails', 'evidence']);
  if (!['tutor', 'learning_center'].includes(body.providerType)) fail('Choose tutor or learning center.');
  return {
    providerType: body.providerType,
    providerName: text(body.providerName, 'Provider name', 120),
    contactDetails: text(body.contactDetails, 'Contact details', 300),
    evidence: text(body.evidence, 'Verification details', 2000),
  };
}

function submissionId(value) {
  const id = text(value, 'Submission ID', 36);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) fail('Invalid submission ID.');
  return id;
}

export function reviewInput(body) {
  fields(body, ['id', 'decision', 'reason']);
  const id = submissionId(body.id);
  if (!['approved', 'rejected'].includes(body.decision)) fail('Choose approved or rejected.');
  return { id, decision: body.decision, reason: text(body.reason, 'Review note', 1000, body.decision === 'rejected') };
}

const listingFields = ['title', 'description', 'subjects', 'preparationCategories', 'city', 'district', 'skillLevel', 'monthlyFee',
  'instructionLanguages', 'deliveryModes', ...profileFields];

export function listingInput(body) {
  fields(body, listingFields);
  const subjects = body.subjects ?? [];
  const categories = body.preparationCategories ?? [];
  if (!Array.isArray(subjects) || subjects.length > 12) fail('Supply up to 12 subjects.');
  if (!Array.isArray(categories) || categories.length > 3
      || categories.some((key) => typeof key !== 'string' || !Object.hasOwn(preparationCategories, key))) fail('Choose supported preparation categories.');
  const uniqueSubjects = new Map(subjects.map((value) => {
    const subject = text(value, 'Subject', 60);
    return [subject.normalize('NFKC').toLowerCase(), subject];
  }));
  const choices = (value, options, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > Object.keys(options).length
        || value.some((key) => typeof key !== 'string' || !Object.hasOwn(options, key))) fail(`Choose supported ${label}.`);
    return [...new Set(value)];
  };
  const city = text(body.city, 'City', 80, false).normalize('NFKC').replace(/\s+/gu, ' ');
  const district = text(body.district, 'District', 80, false).normalize('NFKC').replace(/\s+/gu, ' ');
  if (district && !city) fail('Supply a city for the district.');
  const skillLevel = body.skillLevel ?? '';
  if (typeof skillLevel !== 'string' || (skillLevel && !Object.hasOwn(skillLevels, skillLevel))) fail('Choose a supported skill level.');
  const monthlyFee = fee(body.monthlyFee, 'Monthly fee');
  return {
    title: text(body.title, 'Listing title', 120), description: text(body.description, 'Description', 2000),
    subjects: [...uniqueSubjects.values()], preparationCategories: [...new Set(categories)],
    city, district, skillLevel, monthlyFee,
    instructionLanguages: choices(body.instructionLanguages, instructionLanguages, 'instruction languages'),
    deliveryModes: choices(body.deliveryModes, deliveryModes, 'delivery modes'),
    ...profileInput(body),
  };
}

// KAN-11: an edit carries the listing's own UUID plus the complete replacement content.
export function listingUpdateInput(body) {
  fields(body, ['id', ...listingFields]);
  const { id, ...details } = body;
  return { id: submissionId(id), ...listingInput(details) };
}

export function ratingInput(body) {
  fields(body, ['rating', 'text']);
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) fail('Rating must be an integer from 1 to 5.');
  return { rating: body.rating, text: text(body.text, 'Review', 2000) };
}
