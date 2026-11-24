import type { HelpTopic } from './help-center';

export type ExplainStep = { target?: string; selector?: string; reveal?: boolean; helpTopic?: HelpTopic; title: string; text: string };
export type PageExplanation = { name: string; helpTopic: HelpTopic; steps: ExplainStep[] };

export const pageExplanations = {
  create: { name: 'Create with your assistant', helpTopic: 'how', steps: [
    { title: 'One idea is enough to start.', text: 'Describe who the resource is for and what it should help them do. Continue through your publishing address and branding, then choose ChatGPT or Claude. You can skip website import and use your current brand.' },
    { title: 'Connect your assistant once.', text: 'The connection guide shows what to click in your assistant. After connecting, open a new chat, enable Magnets, ask it to create your saved lead magnet and press Enter. Approve the creation request. Completed pages publish automatically once your URL and email delivery are ready.' },
    { title: 'Create in chat. Manage it in Magnets.', text: 'Your assistant creates and publishes your completed page automatically. You can also find it in Lead magnets from the dashboard. Come back to edit, share your live link, see signups and download your resources. Connecting alone does not generate a campaign.' },
  ] },
  campaign: { name: 'Review your campaign', helpTopic: 'editor', steps: [
    { selector: '[aria-label="Campaign preview"]', title: 'Review everything your assistant made.', text: 'Check your resource and emails here. Landing page opens the existing page editor, with its full preview and design controls. On a phone, swipe across these options. A draft is not collecting signups yet.' },
    { title: 'Read the resource and email.', text: 'Open the resource on its own page or download its PDF. Check the delivery email and download link. Follow-ups are optional. Ask your connected assistant to revise the campaign, or edit the lead magnet in Magnets.' },
    { selector: '[aria-label="Lead magnet actions"]', title: 'Edit, publish, then share.', text: 'Edit lead magnet opens the builder. Publish lead magnet makes the signup page live; View live page opens it once published. Write your own post and include the live URL so people can sign up.' },
    { title: 'Come back for your audience.', text: 'Audience opens Signups, where you can see and export the people who requested your resource. The Dashboard link takes you to Home. Your resources are also in Hosted resources.' },
  ] },
  home: { name: 'Home', helpTopic: 'how', steps: [
    { target: 'assistant', title: 'Start here. Let your assistant help.', text: 'Use ChatGPT or Claude to create your resource, signup page, delivery email. Your completed page publishes automatically. Manage it here, or ask your connected assistant to edit a page, check signups or explain analytics.' },
    { target: 'connection', title: 'Connect once. Come back any time.', text: 'This button opens the connection guide. Choose your assistant and follow the pictures. For an older creation-only connection, reconnect using the new link to manage your whole workspace. After connecting, enable Magnets in a new chat, ask it to create your lead magnet and press Enter.' },
    { target: 'manual', title: 'You can also build it here.', text: 'Create manually opens the page builder. Write your own copy and add a resource link. Both ways keep your work in Lead magnets.' },
    { target: 'library', title: 'Review, edit and publish here.', text: 'Lead magnets holds your drafts and live pages. Use Edit to change a page and its emails. Find your downloads in Hosted resources.' },
    { target: 'audience', title: 'Your subscribers are here.', text: 'Signups shows who requested your resources. Search your audience, filter by magnet and export a CSV whenever you need it.' },
  ] },
  pages: { name: 'Lead magnets', helpTopic: 'start', steps: [
    { selector: '[data-help-topic] h1', title: 'All your signup pages, in one place.', text: 'A lead magnet combines something useful with a page where people leave their email to get it. Drafts are private. Published pages can collect signups.' },
    { target: 'manual', title: 'Choose how to create.', text: 'Create manually opens the builder. Prefer ChatGPT or Claude? Go to Home and use the assistant button there. Its lead magnets appear in this list too.' },
    { selector: '[aria-label="Search lead magnets"]', title: 'Find the page you want.', text: 'Search by title or URL. Each card tells you whether the page is a draft or published. An empty list means you are ready to create your first magnet.' },
    { target: 'magnet-actions', title: 'Open a magnet to work on it.', text: 'Use Edit to change the page and emails. The chart button shows analytics; the live-page button appears once published.' },
    { title: 'Share the live page. Watch Signups.', text: 'After publishing, open the live page and copy its URL for your post. People who request the resource appear in Signups. Your files are in Hosted resources.' },
  ] },
  editor: { name: 'Page editor', helpTopic: 'editor', steps: [
    { selector: '[aria-label="Lead magnet setup steps"]', title: 'Build the whole experience here.', text: 'These tabs cover the signup page, delivery email, optional follow-ups and what people see after signing up. On a phone, swipe the tab row to see every tab.' },
    { selector: '[aria-label="Page slug"]', title: 'Choose the last part of the link.', text: 'The slug identifies this page in its URL. Keep it short and easy to recognise. Changing a live page’s slug can affect links you have already shared.' },
    { target: 'editor-save', title: 'Edits save automatically.', text: 'Edit the copy directly in the canvas. Watch the save status here before leaving. Undo and Redo let you step back through changes. If saving fails, the editor tells you.' },
    { title: 'Check the email as well as the page.', text: 'The delivery email sends the resource when someone signs up. Check its download link and preview. Add follow-ups only if you want more emails, and review their timing. The after-signup tab controls the next screen.' },
    { selector: '[aria-label="Toggle published"]', title: 'Publish when you are ready.', text: 'The publishing control switches between Draft and Published. Once published, use View published page to open your live URL. Edits to a published page affect what visitors see.' },
  ] },
  resources: { name: 'Hosted resources', helpTopic: 'resources', steps: [
    { selector: '[data-help-topic] h1', title: 'The things your subscribers receive.', text: 'This page holds resources made with your assistant and files you upload yourself. The signup page collects the email; the resource is the download you deliver.' },
    { target: 'resource-upload', title: 'Upload an existing file.', text: 'Use Upload resource or the drop area for a PDF, ZIP, document, text file or image. The upload screen lets you name it. Uploading alone does not create a signup page.' },
    { target: 'generated-resources', title: 'Assistant-created resources live here too.', text: 'When your assistant saves a campaign, its resource appears here with a link back to the lead magnet. Open it to read or download it. If you have not created one yet, this section will be empty.' },
    { target: 'uploaded-resources', title: 'Use the resource link in your magnet.', text: 'Copy a file’s resource link and use it as the download link in your lead magnet. Anyone with that link can download it. Deleting a resource disables its link, so check any pages using it first.' },
  ] },
  signups: { name: 'Signups', helpTopic: 'signups', steps: [
    { selector: '[data-help-topic] h1', title: 'Meet the people who signed up.', text: 'Every successful signup is kept here. You see one row per email address, even when that person requested more than one magnet. A new account starts with an empty audience.' },
    { selector: '[aria-label="Filter signups by lead magnet"]', title: 'See the audience for one magnet.', text: 'Choose a lead magnet to narrow the list. Use the search box beside it to find someone by name, email or magnet. Filters search the whole audience, not just the rows currently on screen.' },
    { target: 'signup-export', title: 'Your audience is yours to keep.', text: 'Export CSV downloads the people matching your current filters. Clear the filters to export everyone. The button becomes available once there are matching signups.' },
    { target: 'signup-import', title: 'Bring an existing audience with you.', text: 'Import CSV lets you upload a list and choose which columns contain email and name. Add manually is for one person. Choose the magnet they belong to; you need a magnet before importing.' },
    { title: 'Open a person for more detail.', text: 'The list shows their signup history and available follow-up actions. Use Start sequence only when you intentionally want to start an eligible follow-up sequence. Normal website signups handle delivery automatically.' },
  ] },
  brand: { name: 'Brand', helpTopic: 'brand', steps: [
    { selector: '[data-help-topic] h1', title: 'Make your pages look like you.', text: 'Your name, logo, colours and appearance are shared across this account’s pages and previews. Changes here can also update existing live pages.' },
    { target: 'brand-identity', title: 'Start with your name and logo.', text: 'Use your business name and upload a clear logo. If website import is available, you can review its suggestions first. Keep only the details you want to apply.' },
    { target: 'brand-colours', title: 'Choose colours and page appearance.', text: 'Pick your main colour, then adjust the page theme and highlights. Keep text easy to read. These settings style your public pages, not just this dashboard.' },
    { target: 'brand-preview', title: 'Check the preview before leaving.', text: 'The preview shows how your branding looks together. Choose Save brand to apply your changes, then wait for confirmation before leaving.' },
  ] },
  workspace: { name: 'Customise', helpTopic: 'workspace', steps: [
    { selector: '[placeholder="your-brand"]', title: 'Start with your free Magnets address.', text: 'This is the name after magnets.so/. Each lead magnet gets its own page beneath it. Your Magnets link already works, so a custom domain and the connections below are optional.' },
    { selector: '#custom-domain-setup > div > div:first-child', reveal: true, helpTopic: 'domain', title: 'Put your pages on your own domain.', text: 'Enter a domain you own, such as yourbrand.com, and a page subdomain, such as get. The setup below shows the DNS records to add with your domain provider and checks when they are ready. Changing an existing address can affect links you have shared.' },
    { selector: '#sender-connection > div > div > div:first-child', reveal: true, helpTopic: 'email', title: 'Send emails from your own address.', text: 'First add your root domain in Custom domain above. Then follow these steps to choose a sending subdomain, set the name and address people see, and verify the sending DNS records. You can keep the Magnets sender while you set this up.' },
    { selector: '.optional-connections-drawer > summary', reveal: true, title: 'Send new signups to your favourite tools.', text: 'These connections can automatically pass new signup details to your newsletter, CRM or team tools. We will open each one next. Your signups stay in Magnets too. Connecting a service is optional, and viewing this tour does not connect anything.' },
    { selector: '#newsletter-connection > div > .grid', reveal: true, helpTopic: 'newsletter', title: 'Grow your Beehiiv audience automatically.', text: 'Add your Beehiiv publication ID and API key in these two fields. New lead-magnet signups can then be added to that publication with a tag identifying the lead magnet. This sync handles new signups; it does not import your existing Magnets audience.' },
    { selector: '[placeholder="myletter"]', reveal: true, helpTopic: 'newsletter', title: 'Send new subscribers to Substack.', text: 'Enter your publication name, such as myletter, without .substack.com. Magnets will try to add new signups through Substack’s public signup flow. This connection is best effort because Substack has no documented subscriber API. Signups are still kept in Magnets if it fails.' },
    { selector: '#kit-connection > div', reveal: true, helpTopic: 'kit', title: 'Keep your Kit audience up to date.', text: 'Connect Kit with its secure sign-in screen. New signups are added or updated by email and tagged with the lead magnet they requested. Use those tags in Kit to organise your audience or build your own automations.' },
    { selector: '#slack-connection > div > :first-child', reveal: true, helpTopic: 'slack', title: 'Tell your team when a lead arrives.', text: 'Add a Slack incoming-webhook URL for your chosen channel. Each new signup sends a message with the person’s name, email and lead magnet. After saving the connection, Send test lets you check it reaches the right channel.' },
    { selector: '#zapier-connection > div > :first-child', reveal: true, helpTopic: 'zapier', title: 'Connect the other software you use.', text: 'Paste a Zapier Catch Hook URL here. Magnets sends new signup details to that Zap, and you choose the next action in Zapier, such as adding a spreadsheet row or creating a contact in another app. Save your connection, then use Send test to check it.' },
    { selector: '#pipedrive-connection > div > :first-child', reveal: true, helpTopic: 'pipedrive', title: 'Add leads to your Pipedrive CRM.', text: 'Connect your Pipedrive account with the details requested here. New signups can create or update a person by email in Pipedrive, so you can follow up in your CRM without copying each contact manually.' },
    { selector: '#calendar-connection > div > .grid', reveal: true, helpTopic: 'calendar', title: 'Stop follow-ups when someone books.', text: 'Choose Calendly or Cal.com and follow the connection instructions. A matching booking can stop an eligible active follow-up sequence for that person. You only need this if you use bookings and follow-up emails.' },
    { target: 'workspace-legal', reveal: true, helpTopic: 'legal', title: 'Finish with your own legal links.', text: 'Add your business’s privacy policy and terms URLs here if you have them. When you set up any connection, check its save or connection status before leaving. Close the tour whenever you are ready to configure the services you want.' },
  ] },
  account: { name: 'Account', helpTopic: 'account', steps: [
    { target: 'account-profile', title: 'Your personal account details.', text: 'This is the name and email for your Magnets account. Edit your name and choose Update name. To change the logo or name shown on your public pages, use Brand instead.' },
    { target: 'account-password', title: 'Change your password here.', text: 'Enter your current password and your new password, then confirm the change. The tour does not fill in or submit any account settings.' },
    { target: 'account-danger', title: 'Account deletion is permanent.', text: 'The Danger zone is only for deleting your account. Read the confirmation carefully: this affects your pages and stored account data. You do not need it for everyday editing.' },
  ] },
  analytics: { name: 'Analytics', helpTopic: 'analytics', steps: [
    { selector: '[data-help-topic] h1', title: 'See how this magnet performs.', text: 'Analytics belongs to the lead magnet named at the top. It helps you understand visits and signups. Open Signups if you want the actual people and email addresses.' },
    { target: 'analytics-metrics', title: 'Read the numbers together.', text: 'Visits, signups and conversion rate answer different questions. Total signups and unique people are separate. Conversion rate uses signups matched to tracked visits, so it may not equal all signups divided by visits.' },
    { target: 'analytics-chart', title: 'Look for changes over time.', text: 'The chart covers the last 30 days. Each bar is one day; orange marks tracked conversions. A new magnet needs visits before there is useful data here.' },
    { title: 'Use what you learn.', text: 'Check the remaining breakdowns and any A/B results on this page. Edit the magnet to improve the offer or copy, then compare performance over time. A small number of visits is not enough to judge a winner.' },
  ] },
  resource: { name: 'Your resource', helpTopic: 'resources', steps: [
    { target: 'resource-title', title: 'This is what your subscriber gets.', text: 'Read the generated resource here and check the content before sharing it. This is separate from the landing page where people enter their email.' },
    { target: 'resource-download', title: 'Download your PDF.', text: 'Download PDF gives you a copy of the resource. To share your offer and collect emails, use the lead magnet’s published page URL rather than sharing this private dashboard page.' },
    { target: 'resource-back', title: 'Go back to manage the campaign.', text: 'Back to my lead magnet returns you to the campaign. Review its landing page, delivery email there, or ask your connected assistant to revise the resource.' },
  ] },
} satisfies Record<string, PageExplanation>;

export function explanationForPath(path: string): PageExplanation {
  if (path === '/dashboard/home') return pageExplanations.home;
  if (/^\/dashboard\/campaigns\/[^/]+\/resource\/?$/.test(path)) return pageExplanations.resource;
  if (/^\/dashboard\/pages\/[^/]+\/analytics\/?$/.test(path)) return pageExplanations.analytics;
  if (/^\/dashboard\/pages\/[^/]+\/?$/.test(path)) return pageExplanations.editor;
  if (path === '/dashboard/pages') return pageExplanations.pages;
  if (path === '/dashboard/resources') return pageExplanations.resources;
  if (path === '/dashboard/signups') return pageExplanations.signups;
  if (path === '/dashboard/brand') return pageExplanations.brand;
  if (path === '/dashboard/account') return pageExplanations.account;
  return pageExplanations.workspace;
}
