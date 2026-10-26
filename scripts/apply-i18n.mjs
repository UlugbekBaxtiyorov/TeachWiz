/**
 * Applies data-i18n attributes and the i18n.js script tag to all public HTML files.
 * Run: node scripts/apply-i18n.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PUBLIC = 'c:/Users/akbar/OneDrive/Документы/TeachWiz/public';

function addScript(html) {
  if (html.includes('/i18n.js')) return html; // already patched
  return html.replace(
    /(<link rel="stylesheet" href="\/ui\.css">)/,
    '$1\n  <script type="module" src="/i18n.js"></script>'
  );
}

/** Wrap text node of an element — only if not already wrapped. */
function wrapText(html, selector, key, text) {
  // Replace exact text with data-i18n attribute on the element if it's a simple tag,
  // or wrap in a span if inside an anchor/button that has other children
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(data-i18n="${key}")`, 'g');
  if (re.test(html)) return html; // already done

  // Strategy: add data-i18n to the element directly if possible
  return html;
}

// ─── home.html ───────────────────────────────────────────────────────────────
async function patchHome() {
  let h = await readFile(join(PUBLIC, 'home.html'), 'utf8');
  h = addScript(h);
  // Nav links – add data-i18n to the <a> elements
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<a class="btn login-link" href="\/login">Log in<\/a>/, '<a class="btn login-link" href="/login" data-i18n="btn_login">Log in</a>');
  h = h.replace(/<h1>Find the right tutor or learning center<\/h1>/, '<h1 data-i18n="home_heading">Find the right tutor or learning center</h1>');
  h = h.replace(/<label class="field">What do you want to learn\?<input/, '<label class="field"><span data-i18n="home_search_label">What do you want to learn?</span><input');
  h = h.replace(/name="q" placeholder="Subject, skill or course"/, 'name="q" placeholder="Subject, skill or course" data-i18n-placeholder="home_search_placeholder"');
  h = h.replace(/<button class="btn btn-soft" type="submit" name="near" value="me">Use my location<\/button>/, '<button class="btn btn-soft" type="submit" name="near" value="me" data-i18n="btn_use_location">Use my location</button>');
  h = h.replace(/> Search<\/button>/, '> <span data-i18n="btn_search">Search</span></button>');
  h = h.replace(/<h2>Top rated near you<\/h2>/, '<h2 data-i18n="home_top_rated">Top rated near you</h2>');
  // Tabbar
  h = h.replace(/<a href="\/" aria-current="page">Browse<\/a>/, '<a href="/" aria-current="page" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account">Account<\/a>/, '<a href="/account" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'home.html'), h, 'utf8');
  console.log('✔ home.html');
}

// ─── search.html ─────────────────────────────────────────────────────────────
async function patchSearch() {
  let h = await readFile(join(PUBLIC, 'search.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<a class="btn login-link" href="\/login">Log in<\/a>/, '<a class="btn login-link" href="/login" data-i18n="btn_login">Log in</a>');
  // Search bar labels
  h = h.replace(/<label class="field">Subject or skill<input/, '<label class="field"><span data-i18n="search_subject_label">Subject or skill</span><input');
  h = h.replace(/name="q" placeholder="e\.g\. IELTS, Math, Python"/, 'name="q" placeholder="e.g. IELTS, Math, Python" data-i18n-placeholder="search_subject_placeholder"');
  h = h.replace(/<label class="field">Location<input/, '<label class="field"><span data-i18n="search_location_label">Location</span><input');
  h = h.replace(/name="location" placeholder="Tashkent, Yunusabad"/, 'name="location" placeholder="Tashkent, Yunusabad" data-i18n-placeholder="search_location_placeholder"');
  h = h.replace(/<button class="btn btn-soft gps" type="submit" name="near" value="me">Use my GPS<\/button>/, '<button class="btn btn-soft gps" type="submit" name="near" value="me" data-i18n="btn_use_gps">Use my GPS</button>');
  h = h.replace(/<span class="submit-label">Search<\/span>/, '<span class="submit-label" data-i18n="btn_search">Search</span>');
  // Filters
  h = h.replace(/<h2>Price per month \(UZS\)<\/h2>/, '<h2 data-i18n="filter_price_heading">Price per month (UZS)</h2>');
  h = h.replace(/<h2 id="filter-rating">Minimum rating<\/h2>/, '<h2 id="filter-rating" data-i18n="filter_rating_heading">Minimum rating</h2>');
  h = h.replace(/<h2 id="filter-language">Instruction language<\/h2>/, '<h2 id="filter-language" data-i18n="filter_language_heading">Instruction language</h2>');
  h = h.replace(/<h2 id="filter-delivery">Delivery mode<\/h2>/, '<h2 id="filter-delivery" data-i18n="filter_delivery_heading">Delivery mode</h2>');
  h = h.replace(/<h2 id="filter-reviews">Reviews<\/h2>/, '<h2 id="filter-reviews" data-i18n="filter_reviews_heading">Reviews</h2>');
  h = h.replace(/<h2>Distance<\/h2>/, '<h2 data-i18n="filter_distance_heading">Distance</h2>');
  // Sort options
  h = h.replace(/<option>Sort: Relevance<\/option>/, '<option data-i18n="search_sort_relevance">Sort: Relevance</option>');
  h = h.replace(/<option>Price<\/option>/, '<option data-i18n="search_sort_price">Price</option>');
  h = h.replace(/<option>Distance<\/option>/, '<option data-i18n="search_sort_distance">Distance</option>');
  h = h.replace(/<option>Popularity<\/option>/, '<option data-i18n="search_sort_popularity">Popularity</option>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search" aria-current="page">Map<\/a>/, '<a href="/search" aria-current="page" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account">Account<\/a>/, '<a href="/account" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'search.html'), h, 'utf8');
  console.log('✔ search.html');
}

// ─── login.html ──────────────────────────────────────────────────────────────
async function patchLogin() {
  let h = await readFile(join(PUBLIC, 'login.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<h1 id="form-title">Welcome back\.<\/h1>/, '<h1 id="form-title" data-i18n="login_welcome">Welcome back.</h1>');
  h = h.replace(/<p class="muted" id="form-subtitle">Sign in and pick up where you left off\.<\/p>/, '<p class="muted" id="form-subtitle" data-i18n="login_subtitle">Sign in and pick up where you left off.</p>');
  h = h.replace(/<button id="login-mode" type="button" aria-pressed="true">Sign in<\/button>/, '<button id="login-mode" type="button" aria-pressed="true" data-i18n="login_btn_signin">Sign in</button>');
  h = h.replace(/<button id="signup-mode" type="button" aria-pressed="false">Create account<\/button>/, '<button id="signup-mode" type="button" aria-pressed="false" data-i18n="login_btn_create">Create account</button>');
  h = h.replace(/<label class="field" for="email">Email address<input/, '<label class="field" for="email"><span data-i18n="login_email_label">Email address</span><input');
  h = h.replace(/<label class="field" for="password">Password<input/, '<label class="field" for="password"><span data-i18n="login_password_label">Password</span><input');
  h = h.replace(/<p class="hint" id="password-hint">Use 8–128 characters\. Spaces are welcome\.<\/p>/, '<p class="hint" id="password-hint" data-i18n="login_password_hint">Use 8–128 characters. Spaces are welcome.</p>');
  h = h.replace(/<button class="btn btn-primary" id="submit" type="submit">Sign in<\/button>/, '<button class="btn btn-primary" id="submit" type="submit" data-i18n="login_btn_signin">Sign in</button>');
  h = h.replace(/<h1 tabindex="-1" id="session-title">You're signed in\.<\/h1>/, '<h1 tabindex="-1" id="session-title" data-i18n="login_signed_in_title">You\'re signed in.</h1>');
  h = h.replace(/<a class="btn btn-primary" href="\/account">Go to your account<\/a>/, '<a class="btn btn-primary" href="/account" data-i18n="btn_go_account">Go to your account</a>');
  h = h.replace(/<button class="btn" id="logout" type="button">Sign out<\/button>/, '<button class="btn" id="logout" type="button" data-i18n="btn_logout">Sign out</button>');
  h = h.replace(/<noscript>Please enable JavaScript to sign in or create an account\.<\/noscript>/, '<noscript data-i18n="login_noscript">Please enable JavaScript to sign in or create an account.</noscript>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account" aria-current="page">Account<\/a>/, '<a href="/account" aria-current="page" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'login.html'), h, 'utf8');
  console.log('✔ login.html');
}

// ─── account.html ─────────────────────────────────────────────────────────────
async function patchAccount() {
  let h = await readFile(join(PUBLIC, 'account.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<p class="eyebrow">Your Teachwiz<\/p>/, '<p class="eyebrow" data-i18n="account_your_teachwiz">Your Teachwiz</p>');
  h = h.replace(/<h1 class="page-title">Account<\/h1>/, '<h1 class="page-title" data-i18n="account_title">Account</h1>');
  h = h.replace(/>Browse tutors &amp; centers <span/, '><span data-i18n="account_browse_link">Browse tutors &amp; centers</span> <span');
  h = h.replace(/<h2>Sign in to see your account<\/h2>/, '<h2 data-i18n="account_signin_prompt">Sign in to see your account</h2>');
  h = h.replace(/<p class="muted">Keep track of the centers you contact and pick up where you left off\.<\/p>/, '<p class="muted" data-i18n="account_signin_desc">Keep track of the centers you contact and pick up where you left off.</p>');
  h = h.replace(/<a class="btn btn-primary" href="\/login">Log in<\/a>/, '<a class="btn btn-primary" href="/login" data-i18n="btn_login">Log in</a>');
  h = h.replace(/<a class="btn" href="\/login#signup">Create account<\/a>/, '<a class="btn" href="/login#signup" data-i18n="btn_create_account">Create account</a>');
  h = h.replace(/<h2 id="details-title">Your details<\/h2>/, '<h2 id="details-title" data-i18n="account_your_details">Your details</h2>');
  h = h.replace(/<button class="btn" id="logout" type="button">Sign out<\/button>/, '<button class="btn" id="logout" type="button" data-i18n="btn_logout">Sign out</button>');
  h = h.replace(/<button class="btn" id="workspace-open" type="button">Refresh status<\/button>/, '<button class="btn" id="workspace-open" type="button" data-i18n="btn_refresh_status">Refresh status</button>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account" aria-current="page">Account<\/a>/, '<a href="/account" aria-current="page" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'account.html'), h, 'utf8');
  console.log('✔ account.html');
}

// ─── saved.html ───────────────────────────────────────────────────────────────
async function patchSaved() {
  let h = await readFile(join(PUBLIC, 'saved.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<a class="btn login-link" href="\/login">Log in<\/a>/, '<a class="btn login-link" href="/login" data-i18n="btn_login">Log in</a>');
  h = h.replace(/<h1 class="page-title">Saved<\/h1>/, '<h1 class="page-title" data-i18n="saved_title">Saved</h1>');
  h = h.replace(/<h2>No saved centers yet<\/h2>/, '<h2 data-i18n="saved_empty_heading">No saved centers yet</h2>');
  h = h.replace(/<p class="muted">Tutors and learning centers you save will appear here, so you can compare them later\.<\/p>/, '<p class="muted" data-i18n="saved_empty_desc">Tutors and learning centers you save will appear here, so you can compare them later.</p>');
  h = h.replace(/<a class="btn btn-primary" href="\/search">Browse centers<\/a>/, '<a class="btn btn-primary" href="/search" data-i18n="btn_browse_centers">Browse centers</a>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved" aria-current="page">Saved<\/a>/, '<a href="/saved" aria-current="page" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account">Account<\/a>/, '<a href="/account" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'saved.html'), h, 'utf8');
  console.log('✔ saved.html');
}

// ─── for-centers.html ────────────────────────────────────────────────────────
async function patchForCenters() {
  let h = await readFile(join(PUBLIC, 'for-centers.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers" aria-current="page">For centers<\/a>/, '<a href="/for-centers" aria-current="page" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<a class="btn login-link" href="\/login">Log in<\/a>/, '<a class="btn login-link" href="/login" data-i18n="btn_login">Log in</a>');
  h = h.replace(/<p class="eyebrow">For tutors and learning centers<\/p>/, '<p class="eyebrow" data-i18n="for_centers_eyebrow">For tutors and learning centers</p>');
  h = h.replace(/<h1>Get found by students near you<\/h1>/, '<h1 data-i18n="for_centers_heading">Get found by students near you</h1>');
  h = h.replace(/<p class="lead muted">List your center on Teachwiz so students can compare subjects, prices and schedules, then contact you directly\.<\/p>/, '<p class="lead muted" data-i18n="for_centers_lead">List your center on Teachwiz so students can compare subjects, prices and schedules, then contact you directly.</p>');
  h = h.replace(/<a class="btn btn-primary" href="\/account">Get verified<\/a>/, '<a class="btn btn-primary" href="/account" data-i18n="btn_get_verified">Get verified</a>');
  h = h.replace(/<a class="btn" href="\/centers\/bright-minds">See an example profile<\/a>/, '<a class="btn" href="/centers/bright-minds" data-i18n="btn_see_example">See an example profile</a>');
  h = h.replace(/<h2>Show up in local search<\/h2>/, '<h2 data-i18n="for_centers_feature1_title">Show up in local search</h2>');
  h = h.replace(/<p class="muted">Students search by subject and distance\. Your profile appears on the map with your price per month\.<\/p>/, '<p class="muted" data-i18n="for_centers_feature1_desc">Students search by subject and distance. Your profile appears on the map with your price per month.</p>');
  h = h.replace(/<h2>Earn the Verified badge<\/h2>/, '<h2 data-i18n="for_centers_feature2_title">Earn the Verified badge</h2>');
  h = h.replace(/<p class="muted">Verified centers are confirmed by the Teachwiz team and marked in every listing\.<\/p>/, '<p class="muted" data-i18n="for_centers_feature2_desc">Verified centers are confirmed by the Teachwiz team and marked in every listing.</p>');
  h = h.replace(/<h2>Hear from students directly<\/h2>/, '<h2 data-i18n="for_centers_feature3_title">Hear from students directly</h2>');
  h = h.replace(/<p class="muted">Telegram and Call buttons connect students straight to you\.<\/p>/, '<p class="muted" data-i18n="for_centers_feature3_desc">Telegram and Call buttons connect students straight to you.</p>');
  h = h.replace(/<h2>How it works<\/h2>/, '<h2 data-i18n="for_centers_how_title">How it works</h2>');
  h = h.replace(/<b>Create an account<\/b>/, '<b data-i18n="for_centers_step1_title">Create an account</b>');
  h = h.replace(/<p class="muted">Sign up with your email\.<\/p>/, '<p class="muted" data-i18n="for_centers_step1_desc">Sign up with your email.</p>');
  h = h.replace(/<b>Submit your details<\/b>/, '<b data-i18n="for_centers_step2_title">Submit your details</b>');
  h = h.replace(/<p class="muted">Apply as a tutor or learning center with your contact details and supporting information\.<\/p>/, '<p class="muted" data-i18n="for_centers_step2_desc">Apply as a tutor or learning center with your contact details and supporting information.</p>');
  h = h.replace(/<b>Get reviewed<\/b>/, '<b data-i18n="for_centers_step3_title">Get reviewed</b>');
  h = h.replace(/<p class="muted">We verify your application, then review your listing before it goes live\.<\/p>/, '<p class="muted" data-i18n="for_centers_step3_desc">We verify your application, then review your listing before it goes live.</p>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account">Account<\/a>/, '<a href="/account" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'for-centers.html'), h, 'utf8');
  console.log('✔ for-centers.html');
}

// ─── center.html ──────────────────────────────────────────────────────────────
async function patchCenter() {
  let h = await readFile(join(PUBLIC, 'center.html'), 'utf8');
  h = addScript(h);
  h = h.replace(/<a href="\/search\?type=tutors">Tutors<\/a>/, '<a href="/search?type=tutors" data-i18n="nav_tutors">Tutors</a>');
  h = h.replace(/<a href="\/search\?type=centers">Centers<\/a>/, '<a href="/search?type=centers" data-i18n="nav_centers">Centers</a>');
  h = h.replace(/<a href="\/search\?type=courses">Courses<\/a>/, '<a href="/search?type=courses" data-i18n="nav_courses">Courses</a>');
  h = h.replace(/<a href="\/for-centers">For centers<\/a>/, '<a href="/for-centers" data-i18n="nav_for_centers">For centers</a>');
  h = h.replace(/<a class="btn login-link" href="\/login">Log in<\/a>/, '<a class="btn login-link" href="/login" data-i18n="btn_login">Log in</a>');
  h = h.replace(/<span class="verified">Verified<\/span>/, '<span class="verified" data-i18n="center_verified">Verified</span>');
  h = h.replace(/<h2>About<\/h2>/, '<h2 data-i18n="center_about">About</h2>');
  h = h.replace(/<h2>Pricing<\/h2>/, '<h2 data-i18n="center_pricing">Pricing</h2>');
  h = h.replace(/<h2>Schedule<\/h2>/, '<h2 data-i18n="center_schedule">Schedule</h2>');
  h = h.replace(/<h2>Teachers<\/h2>/, '<h2 data-i18n="center_teachers">Teachers</h2>');
  h = h.replace(/<h2>Reviews<\/h2>/, '<h2 data-i18n="center_reviews">Reviews</h2>');
  h = h.replace(/<label class="field">Rating/, '<label class="field"><span data-i18n="center_review_rating_label">Rating</span>');
  h = h.replace(/<label class="field">Your review/, '<label class="field"><span data-i18n="center_review_text_label">Your review</span>');
  h = h.replace(/<button id="review-submit" class="btn btn-primary" type="button">Submit review<\/button>/, '<button id="review-submit" class="btn btn-primary" type="button" data-i18n="btn_submit_review">Submit review</button>');
  // Tabbar
  h = h.replace(/<a href="\/">Browse<\/a>/, '<a href="/" data-i18n="nav_browse">Browse</a>');
  h = h.replace(/<a href="\/search">Map<\/a>/, '<a href="/search" data-i18n="nav_map">Map</a>');
  h = h.replace(/<a href="\/saved">Saved<\/a>/, '<a href="/saved" data-i18n="nav_saved">Saved</a>');
  h = h.replace(/<a href="\/account">Account<\/a>/, '<a href="/account" data-i18n="nav_account">Account</a>');
  await writeFile(join(PUBLIC, 'center.html'), h, 'utf8');
  console.log('✔ center.html');
}

await patchHome();
await patchSearch();
await patchLogin();
await patchAccount();
await patchSaved();
await patchForCenters();
await patchCenter();
console.log('\nAll HTML files patched with data-i18n attributes.');
