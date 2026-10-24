import { listingInput } from '../src/verification.js';

export function catalogFixture(store) {
  const admin = store.createUser('catalog-admin@example.test', 'unused', 'admin');
  let index = 0;
  return {
    admin,
    add({ providerName = 'Bright Minds Center', providerType = 'learning_center', approved = true, verified = true, ...details } = {}) {
      index++;
      const user = store.createUser(`catalog-${index}@example.test`, 'unused');
      const application = store.submitApplication(user.id, { providerName, providerType, contactDetails: 'private@example.test', evidence: 'PRIVATE evidence' }, index);
      if (verified) store.reviewApplication(admin.id, { id: application.id, decision: 'approved', reason: 'PRIVATE note' }, index);
      const listing = store.submitListing(user.id, listingInput({ title: 'Math lessons', description: 'Small-group lessons.', ...details }), index);
      if (approved && verified) store.reviewListing(admin.id, { id: listing.id, decision: 'approved', reason: '' }, index);
      return { user, listing, application };
    },
  };
}
