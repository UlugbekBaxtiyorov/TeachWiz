import { randomUUID } from 'node:crypto';

function fail(status, message) { throw Object.assign(new Error(message), { status }); }

function review(row) {
  return {
    id: row.id,
    providerId: row.provider_id,
    studentId: row.student_id,
    studentEmail: row.studentEmail,
    rating: row.rating,
    text: row.review_text,
    createdAt: row.created_at,
  };
}

export function providerStore(db) {
  const transaction = (action) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const roleFor = (id) => db.prepare('SELECT role FROM users WHERE id = ?').get(id)?.role;
  const requireRole = (id, roles) => {
    if (!roles.includes(roleFor(id))) fail(403, 'Your account cannot perform this action.');
  };
  const verified = (id) => roleFor(id) === 'representative'
    && Boolean(db.prepare("SELECT 1 FROM representative_applications WHERE user_id = ? AND status = 'approved'").get(id));
  const application = (id) => db.prepare(`SELECT id, provider_type AS providerType, provider_name AS providerName,
    contact_details AS contactDetails, evidence, status, submitted_at AS submittedAt,
    reviewed_at AS reviewedAt, review_reason AS reviewReason
    FROM representative_applications WHERE id = ?`).get(id);
  const listing = (id) => db.prepare(`SELECT id, title, description, status, submitted_at AS submittedAt,
    reviewed_at AS reviewedAt, review_reason AS reviewReason FROM listings WHERE id = ?`).get(id);

  const providerExists = (providerId) => db.prepare(`SELECT 1 FROM listings l
    JOIN users u ON u.id = l.user_id
    JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'
    WHERE l.id = ? AND l.status = 'approved' AND u.role = 'representative'`).get(providerId);

  const reviewSummary = (providerId) => db.prepare(`SELECT
      COUNT(*) AS reviewCount,
      COALESCE(AVG(rating), 0) AS averageRating
    FROM reviews WHERE provider_id = ?`).get(providerId);

  return {
    isVerifiedRepresentative: verified,
    applicationsFor(userId) {
      return db.prepare('SELECT id FROM representative_applications WHERE user_id = ? ORDER BY rowid DESC').all(userId)
        .map(({ id }) => application(id));
    },
    submitApplication(userId, input, now) {
      return transaction(() => {
        requireRole(userId, ['student', 'representative']);
        if (db.prepare("SELECT 1 FROM representative_applications WHERE user_id = ? AND status IN ('pending', 'approved')").get(userId)) {
          fail(409, 'You already have a pending or approved application.');
        }
        const id = randomUUID();
        db.prepare(`INSERT INTO representative_applications
          (id, user_id, provider_type, provider_name, contact_details, evidence, status, submitted_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(id, userId, input.providerType, input.providerName, input.contactDetails, input.evidence, now);
        return application(id);
      });
    },
    pendingApplications() {
      return db.prepare(`SELECT a.id, u.email AS applicantEmail FROM representative_applications a
        JOIN users u ON u.id = a.user_id WHERE a.status = 'pending' ORDER BY a.rowid LIMIT 100`).all()
        .map(({ id, applicantEmail }) => ({ ...application(id), applicantEmail }));
    },
    reviewApplication(adminId, input, now) {
      return transaction(() => {
        requireRole(adminId, ['admin']);
        const row = db.prepare('SELECT user_id, status FROM representative_applications WHERE id = ?').get(input.id);
        if (!row) fail(404, 'Application not found.');
        if (row.user_id === adminId) fail(403, 'You cannot review your own application.');
        if (row.status !== 'pending') fail(409, 'This application has already been reviewed. Refresh the queue.');
        if (input.decision === 'approved') {
          requireRole(row.user_id, ['student', 'representative']);
          db.prepare("UPDATE users SET role = 'representative' WHERE id = ?").run(row.user_id);
        }
        db.prepare(`UPDATE representative_applications SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ?
          WHERE id = ?`).run(input.decision, adminId, now, input.reason, input.id);
        return application(input.id);
      });
    },
    listingsFor(userId) {
      const approved = verified(userId);
      return db.prepare('SELECT id FROM listings WHERE user_id = ? ORDER BY rowid DESC').all(userId)
        .map(({ id }) => { const row = listing(id); return { ...row, published: approved && row.status === 'approved' }; });
    },
    submitListing(userId, input, now) {
      return transaction(() => {
        requireRole(userId, ['student', 'representative']);
        if (!db.prepare('SELECT 1 FROM representative_applications WHERE user_id = ?').get(userId)) {
          fail(403, 'Apply for representative verification before submitting a listing.');
        }
        const id = randomUUID();
        db.prepare(`INSERT INTO listings (id, user_id, title, description, status, submitted_at)
          VALUES (?, ?, ?, ?, 'pending', ?)`).run(id, userId, input.title, input.description, now);
        return { ...listing(id), published: false };
      });
    },
    pendingListings() {
      return db.prepare(`SELECT l.id, l.user_id, u.email AS applicantEmail FROM listings l
        JOIN users u ON u.id = l.user_id WHERE l.status = 'pending' ORDER BY l.rowid LIMIT 100`).all()
        .map(({ id, user_id, applicantEmail }) => ({ ...listing(id), applicantEmail, representativeVerified: verified(user_id) }));
    },
    reviewListing(adminId, input, now) {
      return transaction(() => {
        requireRole(adminId, ['admin']);
        const row = db.prepare('SELECT user_id, status FROM listings WHERE id = ?').get(input.id);
        if (!row) fail(404, 'Listing not found.');
        if (row.user_id === adminId) fail(403, 'You cannot review your own listing.');
        if (row.status !== 'pending') fail(409, 'This listing has already been reviewed. Refresh the queue.');
        if (input.decision === 'approved' && !verified(row.user_id)) fail(409, 'Verify the representative before approving their listing.');
        db.prepare(`UPDATE listings SET status = ?, reviewed_by = ?, reviewed_at = ?, review_reason = ?
          WHERE id = ?`).run(input.decision, adminId, now, input.reason, input.id);
        return { ...listing(input.id), published: input.decision === 'approved' && verified(row.user_id) };
      });
    },
    publishedListings() {
      return db.prepare(`SELECT l.id, l.title, l.description, a.provider_type AS providerType, a.provider_name AS providerName
        FROM listings l JOIN users u ON u.id = l.user_id
        JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'
        WHERE l.status = 'approved' AND u.role = 'representative' ORDER BY l.rowid DESC LIMIT 100`).all();
    },
    reviewsFor(providerId) {
      if (!providerExists(providerId)) fail(404, 'Provider not found.');
      const summary = reviewSummary(providerId);
      const reviews = db.prepare(`SELECT r.id, r.provider_id, r.student_id, u.email AS studentEmail,
          r.rating, r.review_text, r.created_at
        FROM reviews r JOIN users u ON u.id = r.student_id
        WHERE r.provider_id = ? ORDER BY r.created_at DESC, r.rowid DESC`).all(providerId).map(review);
      return {
        averageRating: Number(Number(summary.averageRating).toFixed(2)),
        reviewCount: Number(summary.reviewCount),
        reviews,
      };
    },
    reviewForStudent(providerId, studentId) {
      const row = db.prepare(`SELECT r.id, r.provider_id, r.student_id, u.email AS studentEmail,
        r.rating, r.review_text, r.created_at FROM reviews r
        JOIN users u ON u.id = r.student_id WHERE r.provider_id = ? AND r.student_id = ?`)
        .get(providerId, studentId);
      return row ? review(row) : null;
    },
    submitReview(studentId, input, now) {
      return transaction(() => {
        requireRole(studentId, ['student']);
        if (!providerExists(input.providerId)) fail(404, 'Provider not found.');
        if (db.prepare('SELECT 1 FROM reviews WHERE provider_id = ? AND student_id = ?').get(input.providerId, studentId)) {
          fail(409, 'You have already reviewed this provider.');
        }
        const id = randomUUID();
        db.prepare(`INSERT INTO reviews (id, provider_id, student_id, rating, review_text, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`).run(id, input.providerId, studentId, input.rating, input.text, now);
        return review(db.prepare(`SELECT r.id, r.provider_id, r.student_id, u.email AS studentEmail,
          r.rating, r.review_text, r.created_at FROM reviews r JOIN users u ON u.id = r.student_id WHERE r.id = ?`).get(id));
      });
    },
  };
}
