/* Fictional employee handbook for "Brightmoor Labs", a made-up company. Written for the Oarsman AI RAG demo. Not real policy. */
(function (root, data) { if (typeof module === 'object' && module.exports) module.exports = data; else root.HANDBOOK = data; })(typeof self !== 'undefined' ? self : this, {
  company: 'Brightmoor Labs', version: 'v3.2 (fictional)', updated: '2026-10-01',
  sections: [
    { id: 'welcome', title: '1. Welcome and how to use this handbook', paras: [
      'Brightmoor Labs is a 60-person software company that builds booking tools for salons and spas. This handbook explains how we work, what we offer and what we expect.',
      'If a policy here conflicts with your employment contract, your contract wins. Questions about this handbook go to the People team at people@brightmoor.example.' ] },
    { id: 'hours', title: '2. Working hours and core hours', paras: [
      'A full-time week is 38 hours. You choose when to work, but everyone is expected to be available during core hours, 11:00 to 15:00 in your home time zone, Monday to Friday.',
      'Wednesdays are no-meeting days. Internal meetings should not be booked on a Wednesday unless there is a production incident.',
      'Overtime is not expected. If you work more than 45 hours in a week because of an incident, you can take the extra hours back as time off within the next month.' ] },
    { id: 'remote', title: '3. Remote work and the office', paras: [
      'Brightmoor is remote-first. You can work from anywhere in a country where we have a payroll entity: Portugal, Ireland and the Netherlands.',
      'Working from another country for more than 30 days in a calendar year needs written approval from the People team, because of tax and insurance rules.',
      'Our only office is the Harbor Street hub in Lisbon. Anyone can book a desk there through the desk booking page. Visitors must be signed in at reception and accompanied at all times.' ] },
    { id: 'pto', title: '4. Paid time off (vacation)', paras: [
      'Full-time employees get 25 days of paid vacation per calendar year, plus public holidays. Part-time employees get a pro-rated amount.',
      'Vacation builds up monthly at about 2.08 days per month. You can carry over up to 5 unused days into the next year; carried-over days expire on 31 March.',
      'Request time off in the HR portal. For breaks longer than 3 working days, request at least 2 weeks in advance. Your manager should reply within 3 working days.' ] },
    { id: 'holidays', title: '5. Public holidays', paras: [
      'You get the public holidays of the country you are employed in. If you prefer, you may swap up to 2 public holidays a year for other days that matter to you, with your manager\'s agreement.',
      'The whole company is closed between 24 December and 1 January. These closure days do not count against your 25 vacation days.' ] },
    { id: 'sick', title: '6. Sick leave', paras: [
      'If you are ill, tell your manager before your core hours start and record it in the HR portal. You do not need to explain the illness.',
      'Brightmoor pays full salary for up to 10 sick days per year. A doctor\'s note is needed if you are off sick for more than 3 days in a row.',
      'Mental health days count as sick days. Longer illness is handled case by case with the People team and any statutory sick pay in your country.' ] },
    { id: 'parental', title: '7. Parental leave', paras: [
      'The primary caregiver gets 16 weeks of parental leave at full pay. The secondary caregiver gets 6 weeks at full pay. This applies to birth, adoption and surrogacy.',
      'You become eligible after 6 months of employment. Tell the People team at least 8 weeks before the leave starts so we can plan cover.',
      'After returning, you can work 80% hours at full pay for the first 4 weeks.' ] },
    { id: 'expenses', title: '8. Expenses', paras: [
      'Submit expense claims in the Expenses tool within 30 days of the purchase. Claims older than 90 days will not be reimbursed.',
      'Attach a receipt for every expense over 25 euros. Expenses above 500 euros need your manager\'s approval before you buy.',
      'Approved expenses are reimbursed with the next monthly payroll. Alcohol is not reimbursed, except at team events approved by a director.' ] },
    { id: 'travel', title: '9. Business travel', paras: [
      'Book economy class for flights under 6 hours. Premium economy is allowed for flights of 6 hours or longer.',
      'Hotels are capped at 180 euros per night, or 250 euros per night in London, New York and Zurich. Book through the travel desk where possible.',
      'The daily meal allowance (per diem) on business trips is 60 euros. Keep receipts; unspent allowance is not paid out.' ] },
    { id: 'equipment', title: '10. Equipment and home office', paras: [
      'Everyone gets a company laptop on day one. Laptops are refreshed every 3 years, or sooner if they stop being fit for your work.',
      'You get a one-time home office budget of 600 euros for a desk, chair, screen or similar, plus a 40 euro monthly internet allowance paid with salary.',
      'Equipment bought with the home office budget is yours to keep after 2 years of employment.' ] },
    { id: 'learning', title: '11. Learning and development', paras: [
      'Each employee has a learning budget of 1,200 euros per year for courses, books, certifications and conferences. Unused budget does not roll over.',
      'You can also spend up to 5 working days a year on learning, such as attending a conference or a course. Agree the dates with your manager.' ] },
    { id: 'security', title: '12. Security and passwords', paras: [
      'Use the company password manager for every work account, and turn on multi-factor authentication (MFA) wherever it is offered. MFA is mandatory for email, code hosting and the HR portal.',
      'Report suspected phishing, a lost or stolen laptop, or any security incident to security@brightmoor.example within 1 hour of noticing it. Reporting quickly matters more than being sure.',
      'Lock your screen whenever you leave your device. Never share passwords, even with colleagues or IT.' ] },
    { id: 'privacy', title: '13. Customer data and privacy', paras: [
      'Customer data, including client appointment data from salons and spas, must stay in approved company systems. Never copy customer data to personal devices, personal email or unapproved AI tools.',
      'Only access customer data when you need it for your work, for example to fix a support ticket. Access is logged and reviewed every quarter.' ] },
    { id: 'conduct', title: '14. Code of conduct and reporting concerns', paras: [
      'We expect everyone to treat colleagues, customers and partners with respect. Harassment, discrimination and bullying are not tolerated.',
      'You can report a concern to your manager, to the People team, or anonymously through the confidential reporting form. Reports are investigated within 10 working days, and retaliation against anyone who reports in good faith is a serious offence.' ] },
    { id: 'reviews', title: '15. Performance reviews', paras: [
      'Performance reviews happen twice a year, in March and September. Each review includes a self-review, feedback from two peers and a conversation with your manager.',
      'Salary changes are decided once a year after the March review and take effect from 1 April.' ] },
    { id: 'payroll', title: '16. Pay and payroll', paras: [
      'Salaries are paid on the last working day of each month. Payslips are available in the HR portal.',
      'If you think your pay is wrong, contact payroll@brightmoor.example before the 5th of the following month so it can be corrected in the next payroll.' ] },
    { id: 'benefits', title: '17. Health and pension benefits', paras: [
      'Brightmoor provides private health insurance for you and your dependants, starting on your first day. Dental cover is included.',
      'We match pension contributions up to 5% of your salary. You can join the pension plan at any time through the HR portal.',
      'Everyone also gets a 30 euro monthly wellbeing allowance for things like a gym, therapy apps or sports classes.' ] },
    { id: 'onboarding', title: '18. Onboarding', paras: [
      'New joiners get an onboarding buddy from another team for their first 3 months. Your buddy is your first stop for questions that are not about your role.',
      'In the first week you set up your accounts and security tools, meet your team, and ship a small change to production with help from your buddy.' ] },
    { id: 'leaving', title: '19. Leaving Brightmoor', paras: [
      'The notice period is 4 weeks unless your contract says otherwise. Please tell your manager in writing.',
      'Return your laptop and any company equipment within 10 working days of your last day. We send a prepaid courier box. Unused vacation days are paid out with your final salary.' ] },
    { id: 'communication', title: '20. Communication norms', paras: [
      'Use public team channels in the team chat by default, so others can find answers later. Use direct messages for personal or sensitive topics.',
      'Reply to messages within one working day. For anything urgent, such as a production incident, page the on-call engineer instead of waiting for a chat reply.' ] },
    { id: 'referrals', title: '21. Referral bonus', paras: [
      'If you refer someone who is hired, you receive a referral bonus of 2,000 euros after they have been with us for 90 days. Managers cannot receive a bonus for hiring into their own team.' ] },
    { id: 'sideprojects', title: '22. Side projects and conflicts of interest', paras: [
      'Side projects are welcome as long as they do not compete with Brightmoor, do not use company time, equipment or confidential information, and do not involve our customers.',
      'Tell your manager about any paid outside work or any personal relationship with a supplier or customer that could look like a conflict of interest.' ] }
  ]
});
