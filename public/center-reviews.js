const ratingEl = document.querySelector('#center-rating');
const countEl = document.querySelector('#center-review-count');
const reviewRatingEl = document.querySelector('#review-rating');
const reviewCountEl = document.querySelector('#review-count');
const listEl = document.querySelector('#review-list');
const editorEl = document.querySelector('#review-editor');
const starsEl = document.querySelector('#review-stars');
const textEl = document.querySelector('#review-text');
const submitEl = document.querySelector('#review-submit');
const statusEl = document.querySelector('#review-status');

let providerId = '';
let selectedRating = 0;

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function renderSummary(summary) {
  const average = Number(summary.average);
  const displayAverage = summary.count ? average.toFixed(1) : '—';
  ratingEl.textContent = displayAverage;
  countEl.textContent = String(summary.count);
  reviewRatingEl.textContent = displayAverage;
  reviewCountEl.textContent = String(summary.count);
}

function renderReviews(reviews) {
  listEl.replaceChildren();
  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No reviews yet.';
    listEl.append(empty);
    return;
  }
  for (const review of reviews) {
    const item = document.createElement('article');
    item.className = 'panel';
    const heading = document.createElement('div');
    heading.className = 'rating';
    const score = document.createElement('b');
    score.textContent = `★ ${review.rating}/5`;
    heading.append(score);
    const text = document.createElement('p');
    text.textContent = review.text;
    item.append(heading, text);
    listEl.append(item);
  }
}

function renderStars() {
  starsEl.replaceChildren();
  for (let value = 1; value <= 5; value += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip';
    button.textContent = `★ ${value}`;
    button.setAttribute('aria-pressed', String(value === selectedRating));
    button.addEventListener('click', () => {
      selectedRating = value;
      renderStars();
    });
    starsEl.append(button);
  }
}

async function getProvider() {
  const response = await fetch('/api/listings');
  if (!response.ok) throw new Error('Unable to load the center.');
  const data = await response.json();
  const listing = data.listings?.find((item) => item.providerName === 'Bright Minds Center');
  if (!listing?.id) throw new Error('Center provider is unavailable.');
  providerId = listing.id;
}

async function loadReviews() {
  const response = await fetch(`/api/providers/${providerId}/reviews`);
  if (!response.ok) throw new Error('Unable to load reviews.');
  const data = await response.json();
  renderSummary(data.reviews);
  renderReviews(data.reviews.reviews);
}

async function enableStudentEditor() {
  const response = await fetch('/api/auth/session');
  if (!response.ok) return;
  const data = await response.json();
  if (data.user?.role === 'student') editorEl.hidden = false;
}

async function submitReview() {
  if (!selectedRating) {
    setStatus('Choose a rating from 1 to 5.', 'review-error');
    return;
  }
  const text = textEl.value.trim();
  if (!text) {
    setStatus('Write a review before submitting.', 'review-error');
    return;
  }
  submitEl.disabled = true;
  setStatus('Submitting…');
  try {
    const response = await fetch(`/api/providers/${providerId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: window.location.origin },
      body: JSON.stringify({ rating: selectedRating, text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to submit review.');
    renderSummary(data.summary);
    renderReviews(data.summary.reviews);
    selectedRating = 0;
    textEl.value = '';
    renderStars();
    setStatus('Review submitted.', 'review-success');
  } catch (error) {
    setStatus(error.message, 'review-error');
  } finally {
    submitEl.disabled = false;
  }
}

submitEl.addEventListener('click', submitReview);
renderStars();

(async () => {
  try {
    await getProvider();
    await loadReviews();
    await enableStudentEditor();
  } catch (error) {
    listEl.replaceChildren();
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = error.message;
    listEl.append(message);
  }
})();
