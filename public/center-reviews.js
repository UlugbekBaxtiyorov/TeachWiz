const ratingEl = document.querySelector('#provider-rating');
const countEl = document.querySelector('#provider-review-count');
const reviewsRating = document.querySelector('#reviews-rating');
const reviewsCount = document.querySelector('#reviews-count');
const list = document.querySelector('#review-list');
const editor = document.querySelector('#review-editor');
const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function render(data) {
  const average = Number(data.averageRating || 0);
  const count = Number(data.reviewCount || 0);
  const display = count ? average.toFixed(2) : '—';
  ratingEl.textContent = `★ ${display}`;
  countEl.textContent = `(${count} review${count === 1 ? '' : 's'})`;
  reviewsRating.textContent = `★ ${display}`;
  reviewsCount.textContent = `(${count} review${count === 1 ? '' : 's'})`;
  list.innerHTML = data.reviews.map(item => `<article class="review-item"><div class="review-meta"><b>★ ${item.rating}/5</b><small>${new Date(item.createdAt).toLocaleDateString()}</small></div><p>${escapeHtml(item.text)}</p></article>`).join('') || '<p class="muted">No reviews yet.</p>';
}

async function renderEditor(providerId) {
  const session = await fetch('/api/auth/session');
  if (!session.ok) return;
  const user = (await session.json()).user;
  if (user?.role !== 'student') return;
  editor.innerHTML = `<form class="review-form" id="review-form"><strong>Your rating</strong><div class="stars" role="radiogroup" aria-label="Rating"><button class="star" type="button" data-rating="1" aria-label="1 star">★</button><button class="star" type="button" data-rating="2" aria-label="2 stars">★</button><button class="star" type="button" data-rating="3" aria-label="3 stars">★</button><button class="star" type="button" data-rating="4" aria-label="4 stars">★</button><button class="star" type="button" data-rating="5" aria-label="5 stars">★</button></div><textarea id="review-text" maxlength="2000" placeholder="Share your experience..."></textarea><button class="btn btn-primary" type="submit">Submit review</button><div id="review-message" aria-live="polite"></div></form>`;
  let rating = 0;
  const stars = [...document.querySelectorAll('.star')];
  stars.forEach(star => star.addEventListener('click', () => { rating = Number(star.dataset.rating); stars.forEach(s => s.classList.toggle('selected', Number(s.dataset.rating) <= rating)); }));
  document.querySelector('#review-form').addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.querySelector('#review-message');
    if (!rating) { message.className = 'review-error'; message.textContent = 'Choose a rating from 1 to 5.'; return; }
    const text = document.querySelector('#review-text').value.trim();
    const response = await fetch(`/api/providers/${providerId}/reviews`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ rating, text }) });
    const body = await response.json();
    if (!response.ok) { message.className = 'review-error'; message.textContent = body.error || 'Could not submit review.'; return; }
    message.className = 'review-success'; message.textContent = 'Review submitted.';
    render(body.summary);
    editor.innerHTML = '';
  });
}

async function loadReviews() {
  const listingsResponse = await fetch('/api/listings');
  if (!listingsResponse.ok) return;
  const { listings } = await listingsResponse.json();
  const provider = listings.find(item => item.providerName === 'Bright Minds Center');
  if (!provider) return;
  const response = await fetch(`/api/providers/${provider.id}/reviews`);
  if (!response.ok) return;
  render(await response.json());
  await renderEditor(provider.id);
}

loadReviews().catch(() => {});
