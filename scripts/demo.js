// Isolated, synthetic examples. Never opens the application's persistent database.
import { openStore } from '../src/store.js';
import { createApp } from '../src/server.js';
import { hashPassword } from '../src/password.js';
import { listingInput } from '../src/verification.js';

const port = Number(process.env.PORT || 3113);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo PORT.');
const store = openStore(':memory:');
const password = 'Teachwiz demo passphrase 123';
const hash = await hashPassword(password);
const admin = store.createUser('admin@example.test', hash, 'admin');
const examples = [
  { providerName: 'Bright Minds Center', providerType: 'learning_center', title: 'Math & Physics · Grades 9–11', subjects: ['Math', 'Physics'], preparationCategories: ['presidential_school'], description: 'Build confidence in mathematics and physics with small classes, guided practice and a clear study plan.' },
  { providerName: 'Lingua Hub', providerType: 'learning_center', title: 'English & IELTS preparation', subjects: ['English'], preparationCategories: ['ielts'], description: 'Practice speaking, writing, listening and reading with a structured IELTS preparation course.' },
  { providerName: 'Code Garden', providerType: 'learning_center', title: 'Programming from the beginning', subjects: ['Programming', 'Python'], description: 'Learn Python through practical projects. Start with the fundamentals and build your first application.' },
  { providerName: 'Aziza Karimova', providerType: 'tutor', title: 'SAT Math with a personal study plan', subjects: ['Math'], preparationCategories: ['sat'], description: 'Individual mathematics lessons with a focus on problem solving and SAT preparation.' },
  { providerName: 'Школа знаний', providerType: 'learning_center', title: 'Математика для начинающих', subjects: ['Математика'], description: 'Занятия по математике с практическими упражнениями и поддержкой преподавателя.' },
];
for (const [index, { providerName, providerType, ...input }] of examples.entries()) {
  const user = store.createUser(`provider${index + 1}@example.test`, hash);
  const now = Date.now() - index * 1000;
  const application = store.submitApplication(user.id, { providerName, providerType, contactDetails: 'Demo contact information', evidence: 'Synthetic demonstration only.' }, now);
  store.reviewApplication(admin.id, { id: application.id, decision: 'approved', reason: '' }, now);
  const listing = store.submitListing(user.id, listingInput(input), now);
  store.reviewListing(admin.id, { id: listing.id, decision: 'approved', reason: '' }, now);
}
store.createUser('student@example.test', hash);
const origin = `http://localhost:${port}`;
const server = await createApp({ store, origin });
server.listen(port, '127.0.0.1', () => console.log(`Synthetic Teachwiz demo: ${origin}\nSign in: student@example.test, provider1@example.test or admin@example.test\nDemo-only password: ${password}`));
const shutdown = () => server.close(() => { store.close(); process.exit(0); });
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
