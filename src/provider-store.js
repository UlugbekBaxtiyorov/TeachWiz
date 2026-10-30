import { randomUUID } from 'node:crypto';

function fail(status, message) { throw Object.assign(new Error(message), { status }); }

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
  const listing = (id) => {
    const row = db.prepare(`SELECT id, title, description, status, subjects, preparation_categories AS preparationCategories,
      city, district, skill_level AS skillLevel, monthly_fee AS monthlyFee,
      instruction_languages AS instructionLanguages, delivery_modes AS deliveryModes,
      lesson_fee AS lessonFee, schedule_summary AS scheduleSummary, contact_phone AS contactPhone,
      contact_telegram AS contactTelegram, address, updated_at AS updatedAt,
      submitted_at AS submittedAt, reviewed_at AS reviewedAt, review_reason AS reviewReason FROM listings WHERE id = ?`).get(id);
    return row && { ...row, subjects: JSON.parse(row.subjects), preparationCategories: JSON.parse(row.preparationCategories),
      instructionLanguages: JSON.parse(row.instructionLanguages), deliveryModes: JSON.parse(row.deliveryModes) };
  };
  const review = (id) => db.prepare(`SELECT r.id, r.provider_id AS providerId, r.student_id AS studentId,
    r.rating, r.text, r.created_at AS createdAt, u.email AS studentEmail
    FROM reviews r JOIN users u ON u.id = r.student_id WHERE r.id = ?`).get(id);
  const resolveProviderId = (identifier) => {
    if (verified(identifier)) return identifier;
    const row = db.prepare(`SELECT l.user_id AS providerId FROM listings l
      JOIN users u ON u.id = l.user_id
      JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'
      WHERE l.id = ? AND l.status = 'approved' AND u.role = 'representative'`).get(identifier);
    if (!row) fail(404, 'Provider not found.');
    return row.providerId;
  };

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
        db.prepare(`INSERT INTO listings (id, user_id, title, description, status, submitted_at, subjects, preparation_categories,
          city, district, skill_level, monthly_fee, instruction_languages, delivery_modes,
          lesson_fee, schedule_summary, contact_phone, contact_telegram, address)
          VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, input.title, input.description, now,
          JSON.stringify(input.subjects || []), JSON.stringify(input.preparationCategories || []),
          input.city || '', input.district || '', input.skillLevel || '', input.monthlyFee ?? null,
          JSON.stringify(input.instructionLanguages || []), JSON.stringify(input.deliveryModes || []),
          input.lessonFee ?? null, input.scheduleSummary || '', input.contactPhone || '', input.contactTelegram || '', input.address || '');
        return { ...listing(id), published: false };
      });
    },
    // KAN-11: owners replace the whole listing. Every edit returns it to the review queue, so changed
    // content is never public before an admin has approved exactly that version.
    updateListing(userId, input, now) {
      return transaction(() => {
        requireRole(userId, ['student', 'representative']);
        const row = db.prepare('SELECT user_id FROM listings WHERE id = ?').get(input.id);
        // Other accounts learn nothing about listings they do not own.
        if (!row || row.user_id !== userId) fail(404, 'Listing not found.');
        db.prepare(`UPDATE listings SET title = ?, description = ?, subjects = ?, preparation_categories = ?,
          city = ?, district = ?, skill_level = ?, monthly_fee = ?, instruction_languages = ?, delivery_modes = ?,
          lesson_fee = ?, schedule_summary = ?, contact_phone = ?, contact_telegram = ?, address = ?,
          status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_reason = '', updated_at = ? WHERE id = ?`)
          .run(input.title, input.description, JSON.stringify(input.subjects), JSON.stringify(input.preparationCategories),
            input.city, input.district, input.skillLevel, input.monthlyFee, JSON.stringify(input.instructionLanguages),
            JSON.stringify(input.deliveryModes), input.lessonFee, input.scheduleSummary, input.contactPhone,
            input.contactTelegram, input.address, now, input.id);
        return { ...listing(input.id), published: false };
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
      return db.prepare(`SELECT l.id, l.title, l.description,
          a.provider_type AS providerType, a.provider_name AS providerName
        FROM listings l JOIN users u ON u.id = l.user_id
        JOIN representative_applications a ON a.user_id = u.id AND a.status = 'approved'
        WHERE l.status = 'approved' AND u.role = 'representative' ORDER BY l.rowid DESC LIMIT 100`).all();
    },
    reviewsFor(providerIdentifier) {
      const providerId = resolveProviderId(providerIdentifier);
      const reviews = db.prepare(`SELECT r.id, r.rating, r.text, r.created_at AS createdAt
        FROM reviews r WHERE r.provider_id = ? ORDER BY r.created_at DESC, r.id DESC`).all(providerId);
      const summary = db.prepare(`SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average
        FROM reviews WHERE provider_id = ?`).get(providerId);
      return {
        average: Number(summary.average),
        count: Number(summary.count),
        reviews,
      };
    },
    submitReview(studentId, providerIdentifier, input, now) {
      return transaction(() => {
        requireRole(studentId, ['student']);
        const providerId = resolveProviderId(providerIdentifier);
        try {
          const id = randomUUID();
          db.prepare(`INSERT INTO reviews (id, provider_id, student_id, rating, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`).run(id, providerId, studentId, input.rating, input.text, now);
          // Keep the catalog's provider-level aggregate in step with the stored reviews (same transaction).
          db.prepare(`INSERT INTO provider_rating_summaries (user_id, score_total, review_count, updated_at)
            SELECT provider_id, sum(rating), count(*), ? FROM reviews WHERE provider_id = ?
            ON CONFLICT(user_id) DO UPDATE SET score_total = excluded.score_total, review_count = excluded.review_count, updated_at = excluded.updated_at`)
            .run(now, providerId);
          return review(id);
        } catch (error) {
          if (String(error.message).includes('UNIQUE constraint failed: reviews.provider_id, reviews.student_id')) {
            fail(409, 'You have already reviewed this provider.');
          }
          throw error;
        }
      });
    },
  };
}
