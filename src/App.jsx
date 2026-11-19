import React, { useState } from 'react';
import {
  Send, Ticket, Bot, CheckCircle2, Clock, Mail, Database,
  BookOpen, BarChart3, Search, MessageSquare, PackageCheck, UserCheck, Globe
} from 'lucide-react';

const CATALOG_PRICES = {
  bread: 40,
  milk: 30,
  eggs: 72,
  rice: 120,
  butter: 58,
  coffee: 145
};

const STANDARD_DELIVERY_FEE = 12;

function runSixAgentPipeline(rawText, channel, customerEmail = '') {
  const cleaned = rawText.trim();
  const lower = cleaned.toLowerCase();

  const mentionedItems = Object.keys(CATALOG_PRICES).filter((item) =>
    new RegExp(`\\b${item}s?\\b`, 'i').test(lower)
  );
  const primaryItem = mentionedItems[0] || 'item';
  const itemPrice =
    mentionedItems.length > 0
      ? mentionedItems.reduce((sum, item) => sum + CATALOG_PRICES[item], 0)
      : 30;

  const orderMatch = cleaned.match(/#?[A-Z]{2,5}-?\d{3,8}/i);
  const orderRef = orderMatch ? orderMatch[0].toUpperCase() : null;

  const amountMatches = [...cleaned.matchAll(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => !Number.isNaN(n) && n > 0);
  const userAmount = amountMatches[0] || itemPrice;
  const maxExplicitAmount = amountMatches.length > 0 ? Math.max(...amountMatches) : 0;

  const humanEscalationPatterns = [
    /\bfraud\b/, /\bscam\b/, /\bunauthorized\b/, /\bhacked\b/, /\bstolen\b/,
    /\bpolice\b/, /\bcourt\b/, /\blegal\b/, /\blawyer\b/, /\bconsumer forum\b/,
    /\bfood poisoning\b/, /\bsick\b/, /\bhospital\b/, /\binjury\b/, /\binjured\b/,
    /\bmultiple times\b/, /\bagain and again\b/, /\bthird time\b/, /\bsecond time\b/,
    /\bmanager\b/, /\bsupervisor\b/, /\bhuman\b/, /\bagent\b/
  ];

  const hasEscalationTrigger =
    humanEscalationPatterns.some((rx) => rx.test(lower)) || maxExplicitAmount >= 1000;

  const strongComplaintPatterns = [
    /\btorn\b/, /\bleaking\b/, /\bleak\b/, /\bdamaged\b/, /\bbroken\b/, /\bspilled\b/,
    /\bspoiled\b/, /\bexpired\b/, /\bmissing\b/, /\bwrong\b/, /\blate\b/, /\bdelay(ed)?\b/,
    /\bnot received\b/, /\bhaven'?t received\b/, /\bnever arrived\b/, /\brefund\b/,
    /\bdeducted\b/, /\bcharged\b/, /\bcomplaint\b/, /\bstuck\b/, /\bfailed\b/, /\bcancel(led)?\b/
  ];

  const hasComplaintSignal =
    hasEscalationTrigger || strongComplaintPatterns.some((rx) => rx.test(lower));
  const looksLikeQuestion =
    cleaned.includes('?') ||
    /^(how much|what|where|when|why|can i|could i|do you|does|is there|are there)\b/i.test(
      lower
    );

  const classification = hasComplaintSignal
    ? 'Complaint'
    : looksLikeQuestion
      ? 'Enquiry'
      : 'Complaint';

  const deliveryTarget =
    channel === 'Email'
      ? `Email reply to ${customerEmail || 'customer email'}`
      : 'Website live reply';

  if (classification === 'Enquiry') {
    const asksPricing =
      /\b(how much|cost|price|charge|charges|fee|fees|money|total)\b/i.test(lower);

    let category = 'General Enquiry';
    let urgency = 'Low';
    let retrievedRule = 'QuickKart General Support & Catalog Guide';
    let resolutionAction = 'Provided direct answer from catalog and service rules.';
    let reply = '';

    if (asksPricing && mentionedItems.length > 0) {
      const includesDelivery = /\b(delivery|charge|charges|fee|fees)\b/i.test(lower);
      const itemsText = mentionedItems
        .map((i) => `${i} (₹${CATALOG_PRICES[i]})`)
        .join(' + ');
      const total = includesDelivery ? itemPrice + STANDARD_DELIVERY_FEE : itemPrice;

      category = 'Pricing & Delivery Enquiry';
      retrievedRule = `Catalog Pricing Table + Standard Delivery Charge (₹${STANDARD_DELIVERY_FEE})`;
      resolutionAction = includesDelivery
        ? `Calculated ${itemsText} + ₹${STANDARD_DELIVERY_FEE} delivery = ₹${total}.`
        : `Calculated item price for ${itemsText} = ₹${total}.`;

      reply = includesDelivery
        ? `It will cost ₹${itemPrice} with ₹${STANDARD_DELIVERY_FEE} delivery charge, total ₹${total}. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`
        : `The price for ${itemsText} is ₹${total}. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
    } else if (asksPricing && amountMatches.length > 0) {
      const includesDelivery = /\b(delivery|charge|charges|fee|fees)\b/i.test(lower);
      const total = includesDelivery ? userAmount + STANDARD_DELIVERY_FEE : userAmount;
      category = 'Fee & Cost Enquiry';
      retrievedRule = `Standard Delivery Charge Rule (₹${STANDARD_DELIVERY_FEE})`;
      resolutionAction = includesDelivery
        ? `Added ₹${STANDARD_DELIVERY_FEE} delivery charge to ₹${userAmount} = ₹${total}.`
        : `Confirmed amount ₹${userAmount}.`;
      reply = includesDelivery
        ? `It will cost ₹${userAmount} with ₹${STANDARD_DELIVERY_FEE} delivery charge, total ₹${total}. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`
        : `The total amount for your enquiry is ₹${total}. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
    } else {
      category = 'Service & Order Enquiry';
      retrievedRule = 'QuickKart Order & Delivery FAQ';
      resolutionAction = `Checked policy details for "${cleaned.replace(/\?+$/, '')}".`;
      reply = `Regarding "${cleaned.replace(/\?+$/, '')}" — orders are packed fresh and tracked live until delivery, and you can reach out anytime if you need help. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
    }

    const pipeline = [
      { agent: 'Agent 1 • Understand', detail: `Parsed ${channel} enquiry: "${cleaned}".` },
      { agent: 'Agent 2 • Classify', detail: `Enquiry → ${category}.` },
      { agent: 'Agent 3 • Urgency', detail: `${urgency} urgency (quick informational lookup).` },
      { agent: 'Agent 4 • Retrieve', detail: `Fetched ${retrievedRule}.` },
      { agent: 'Agent 5 • Resolve', detail: resolutionAction },
      { agent: 'Agent 6 • Dispatch & Validate', detail: `Validated and sent via ${deliveryTarget}.` }
    ];

    return {
      classification,
      category,
      urgency,
      escalatedToHuman: false,
      finalStatus: 'Resolved',
      deliveryTarget,
      reply,
      pipeline
    };
  }

  let category = 'Service & Quality Complaint';
  let urgency = hasEscalationTrigger ? 'High' : 'Medium';
  let mistakeFound = `Packing seal check or transit handling missed the defect on ${primaryItem}${orderRef ? ` (${orderRef})` : ''}.`;
  let retrievedPolicy = 'QuickKart Auto-Replacement & Instant Refund Policy';
  let resolutionStepDetail = '';
  let reply = '';

  const isDamagedOrLeaking =
    /\b(torn|leaking|leak|damaged|broken|spilled|spoiled|expired)\b/i.test(lower);
  const isMissing = /\bmissing\b/i.test(lower);
  const isRefundOrPayment = /\b(refund|deducted|charged|payment)\b/i.test(lower);
  const isDelay =
    /\b(late|delay|delayed|not received|haven'?t received|never arrived|stuck)\b/i.test(lower);

  if (hasEscalationTrigger) {
    category =
      maxExplicitAmount >= 1000
        ? 'High-Value Dispute Escalation'
        : /\b(fraud|scam|unauthorized|hacked|stolen)\b/i.test(lower)
          ? 'Security / Unauthorized Charge Escalation'
          : /\b(food poisoning|sick|hospital|injury|injured)\b/i.test(lower)
            ? 'Safety & Health Escalation'
            : 'Human Specialist Escalation';

    urgency = 'High';
    retrievedPolicy = 'Human Escalation & Senior Resolution Protocol';
    mistakeFound = `High-risk or escalated issue${orderRef ? ` on ${orderRef}` : ''}${maxExplicitAmount >= 1000 ? ` involving ₹${maxExplicitAmount}` : ''} requiring human verification.`;
    resolutionStepDetail = 'Escalated to a human support specialist with full investigation summary.';
    reply = `We take this seriously and have escalated your case${orderRef ? ` (${orderRef})` : ''}${maxExplicitAmount >= 1000 ? ` for ₹${maxExplicitAmount}` : ''} to a human support specialist for priority review. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  } else if (isDamagedOrLeaking) {
    category = 'Damaged / Leaking Item';
    urgency =
      mentionedItems.includes('milk') || /\b(spoiled|expired)\b/i.test(lower)
        ? 'High'
        : 'Medium';
    mistakeFound = `Dark-store quality check missed a ${primaryItem} seal/packaging fault before dispatch${orderRef ? ` on ${orderRef}` : ''}.`;
    retrievedPolicy = 'Damaged / Leaking Perishable Auto-Resolution SOP';
    resolutionStepDetail = `Self-resolved by queuing a free replacement ${primaryItem} and enabling an instant ₹${userAmount} refund option.`;
    reply = `We're really sorry your ${primaryItem} arrived damaged/leaking—that was a packaging mistake on our side. We have arranged a fresh replacement ${primaryItem} at no extra charge (or an instant ₹${userAmount} refund if you prefer). Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  } else if (isMissing) {
    category = 'Missing Item in Order';
    urgency = 'High';
    mistakeFound = `Dark-store packing scan missed ${primaryItem} before sealing the bag${orderRef ? ` for ${orderRef}` : ''}.`;
    retrievedPolicy = 'Missing Item Instant Refund / Re-Dispatch SOP';
    resolutionStepDetail = `Self-resolved with an instant ₹${userAmount} refund or free re-dispatch of ${primaryItem}.`;
    reply = `We're sorry the ${primaryItem} was missing from your delivery—our packing team missed it before dispatch. We have initiated an instant ₹${userAmount} refund (or a free replacement ${primaryItem}) right away. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  } else if (isRefundOrPayment) {
    category = 'Payment & Refund Issue';
    urgency = 'High';
    mistakeFound = `Payment settlement confirmation for ₹${userAmount} was delayed between gateway and order record${orderRef ? ` (${orderRef})` : ''}.`;
    retrievedPolicy = 'Payment Reconciliation & Instant Refund Rule';
    resolutionStepDetail = `Self-resolved by prioritizing ₹${userAmount} payment/refund reconciliation.`;
    reply = `We're sorry for the trouble with your ₹${userAmount} payment/refund—we found a settlement sync delay on our end and prioritized your refund/reconciliation automatically. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  } else if (isDelay) {
    category = 'Delivery Delay';
    urgency = 'High';
    mistakeFound = `Dispatch/rider assignment took longer than expected${orderRef ? ` for order ${orderRef}` : ''}.`;
    retrievedPolicy = 'Delayed Delivery Priority Dispatch & Fee Waiver SOP';
    resolutionStepDetail = `Self-resolved with priority dispatch and a ₹${STANDARD_DELIVERY_FEE} delivery fee waiver.`;
    reply = `We apologize that your delivery is taking longer than expected—there was a dispatch delay on our side. We moved your order to priority dispatch and waived the ₹${STANDARD_DELIVERY_FEE} delivery fee. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  } else {
    reply = `We're sorry for the issue with "${cleaned}"—we traced a service gap on our side and automatically initiated a fix for you. Hope this reply was useful, thanks for reaching out, and have a nice shopping experience!`;
  }

  const pipeline = [
    { agent: 'Agent 1 • Understand', detail: `Parsed ${channel} complaint: "${cleaned}".` },
    { agent: 'Agent 2 • Classify', detail: `Complaint → ${category}.` },
    { agent: 'Agent 3 • Urgency', detail: `${urgency} urgency predicted.` },
    { agent: 'Agent 4 • Retrieve', detail: `Loaded ${retrievedPolicy}.` },
    { agent: 'Agent 5 • Investigate & Resolve', detail: `Mistake: ${mistakeFound} Action: ${resolutionStepDetail}` },
    { agent: 'Agent 6 • Dispatch & Validate', detail: `Validated and sent via ${deliveryTarget}.` }
  ];

  return {
    classification,
    category,
    urgency,
    escalatedToHuman: hasEscalationTrigger,
    finalStatus: hasEscalationTrigger ? 'Escalated to Human' : 'Resolved',
    deliveryTarget,
    reply,
    pipeline
  };
}

const INITIAL_TICKETS = [
  {
    id: 'TKT-1001',
    customer: 'Ananya Nair',
    customerEmail: 'ananya.nair@email.com',
    channel: 'Website',
    ...runSixAgentPipeline('How much money will it cost for a bread with delivery charge?', 'Website'),
    status: 'Resolved',
    stage: 6,
    createdAt: 'Just now'
  },
  {
    id: 'TKT-1002',
    customer: 'Priya Patel',
    customerEmail: 'priya.patel@email.com',
    channel: 'Email',
    ...runSixAgentPipeline('The milk packet I received was torn and leaking.', 'Email', 'priya.patel@email.com'),
    status: 'Resolved',
    stage: 6,
    createdAt: 'Just now'
  },
  {
    id: 'TKT-1003',
    customer: 'Rohan Das',
    customerEmail: 'rohan.das@email.com',
    channel: 'Email',
    ...runSixAgentPipeline('₹2450 was deducted twice for an unauthorized order and I want to speak to a human manager.', 'Email', 'rohan.das@email.com'),
    status: 'Escalated to Human',
    stage: 6,
    createdAt: 'Just now'
  }
];

const INCOMING_EMAILS = [
  {
    id: 'EM-201',
    from: 'vikram.menon@email.com',
    name: 'Vikram Menon',
    subject: 'Milk and eggs cost with delivery?',
    body: 'How much money will it cost for milk and eggs with delivery charge?',
    time: '2 mins ago',
    processed: false
  },
  {
    id: 'EM-202',
    from: 'arjun.k@email.com',
    name: 'Arjun Krishnan',
    subject: 'Milk packet leaking',
    body: 'The milk packet I received was torn and leaking.',
    time: '6 mins ago',
    processed: false
  },
  {
    id: 'EM-203',
    from: 'neha.verma@email.com',
    name: 'Neha Verma',
    subject: 'Unauthorized charge of ₹1850',
    body: 'There is an unauthorized charge of ₹1850 on my account and I suspect fraud.',
    time: '10 mins ago',
    processed: false
  }
];

const KB_ARTICLES = [
  {
    id: 'KB-01',
    title: 'Fast 6-Agent Pipeline & Source-Channel Replies',
    tag: 'Architecture',
    score: '99.5%',
    summary: 'Every website message or incoming email runs through 6 agents rapidly and replies on the exact channel it came from.'
  },
  {
    id: 'KB-02',
    title: 'Human Escalation Rules',
    tag: 'Escalation',
    score: '99.0%',
    summary: 'Escalates disputes of ₹1,000+, fraud/unauthorized charges, safety/health issues, or explicit human requests.'
  },
  {
    id: 'KB-03',
    title: 'Autonomous Item & Delivery Resolution',
    tag: 'Auto-Resolve',
    score: '98.5%',
    summary: 'Computes item + delivery totals and self-resolves standard missing, damaged, or delayed item issues.'
  }
];

function StatusBadge({ status }) {
  if (status === 'Escalated to Human') {
    return (
      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
        Escalated to Human
      </span>
    );
  }
  if (status === 'Resolved') {
    return (
      <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
        Resolved
      </span>
    );
  }
  return (
    <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300">
      Running 6 Agents
    </span>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('portal');
  const [tickets, setTickets] = useState(INITIAL_TICKETS);
  const [emails, setEmails] = useState(INCOMING_EMAILS);
  const [activeTicketId, setActiveTicketId] = useState(INITIAL_TICKETS[0].id);
  const [trackSearchId, setTrackSearchId] = useState(INITIAL_TICKETS[0].id);
  const [dbTab, setDbTab] = useState('Catalog & Fees');

  const [customerName, setCustomerName] = useState('');
  const [userMessage, setUserMessage] = useState('');

  // Ingests a message from Website or Email, runs 6 agents fast, and sends reply back to that channel
  const ingestMessage = (customer, sourceChannel, subject, message, emailAddress = '') => {
    const result = runSixAgentPipeline(message, sourceChannel, emailAddress);
    const newId = `TKT-${1000 + tickets.length + 1}`;
    const totalSteps = result.pipeline.length;

    const newTicket = {
      id: newId,
      customer,
      customerEmail: emailAddress,
      channel: sourceChannel,
      ...result,
      subject,
      message,
      status: 'Running 6 Agents',
      stage: 1,
      createdAt: 'Just now',
      reply: `6 agents processing via ${sourceChannel}...`
    };

    setTickets((prev) => [newTicket, ...prev]);
    setActiveTicketId(newId);
    setTrackSearchId(newId);
    setActiveTab('tracker');

    // Fast 6-agent execution (~1.2s total across all 6 agents)
    [2, 3, 4, 5, 6].forEach((step, idx) => {
      setTimeout(() => {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === newId
              ? {
                  ...t,
                  stage: step,
                  status: step === totalSteps ? result.finalStatus : 'Running 6 Agents',
                  reply: step === totalSteps ? result.reply : t.reply
                }
              : t
          )
        );
      }, (idx + 1) * 200);
    });
  };

  const handleWebsiteSubmit = (e) => {
    e.preventDefault();
    if (!userMessage.trim()) return;
    ingestMessage(
      customerName.trim() || 'Website Visitor',
      'Website',
      userMessage.trim().slice(0, 48) + (userMessage.trim().length > 48 ? '...' : ''),
      userMessage.trim()
    );
    setCustomerName('');
    setUserMessage('');
  };

  const handleEmailIngest = (email) => {
    setEmails((prev) =>
      prev.map((em) => (em.id === email.id ? { ...em, processed: true } : em))
    );
    ingestMessage(email.name, 'Email', email.subject, email.body, email.from);
  };

  const totalCount = tickets.length;
  const complaintCount = tickets.filter((t) => t.classification === 'Complaint').length;
  const enquiryCount = tickets.filter((t) => t.classification === 'Enquiry').length;
  const escalatedCount = tickets.filter((t) => t.status === 'Escalated to Human').length;
  const resolvedCount = tickets.filter((t) => t.status === 'Resolved').length;

  const activeTicket = tickets.find((t) => t.id === activeTicketId) || tickets[0];
  const trackedTicket =
    tickets.find((t) => t.id.toLowerCase() === trackSearchId.trim().toLowerCase()) ||
    tickets[0];
  const emailReplies = tickets.filter((t) => t.channel === 'Email');

  const navItems = [
    { id: 'portal', label: '1. Website Support', icon: Globe },
    { id: 'tracker', label: '2. Track & Reply', icon: PackageCheck },
    { id: 'inbox', label: '3. Email & Replies', icon: Mail },
    { id: 'queue', label: `4. Ticket Queue (${tickets.length})`, icon: Ticket },
    { id: 'monitor', label: '5. 6-Agent Pipeline', icon: Bot },
    { id: 'systems', label: '6. Company Data', icon: Database },
    { id: 'kb', label: '7. Knowledge Base', icon: BookOpen },
    { id: 'analytics', label: '8. Live Summary', icon: BarChart3 }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between">
        <div>
          <div className="px-3 py-2 mb-6">
            <h1 className="text-xl font-bold text-white tracking-tight">QuickKart</h1>
            <p className="text-xs text-slate-400">6-Agent Support System</p>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === item.id
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 6 Agents Fast-Track
          </div>
          Replies Sent to Source Channel
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {/* Live Top Strip */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400">Total Messages</p>
            <p className="text-2xl font-bold mt-1">{totalCount}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400">Complaints</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{complaintCount}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400">Enquiries</p>
            <p className="text-2xl font-bold text-sky-400 mt-1">{enquiryCount}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400">Escalated to Human</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{escalatedCount}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
            <p className="text-xs text-slate-400">Resolved</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{resolvedCount}</p>
          </div>
        </div>

        {/* PAGE 1: WEBSITE SUPPORT */}
        {activeTab === 'portal' && (
          <div className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">QuickKart Website Support</h2>
            <p className="text-sm text-slate-400 mb-6">
              Enter an enquiry or complaint on the website. All 6 agents process it fast and send the reply right back here on the website.
            </p>
            <form onSubmit={handleWebsiteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Your Name</label>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g., Arjun Krishnan"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Enquiry or Complaint</label>
                <textarea
                  rows={4}
                  required
                  value={userMessage}
                  onChange={(e) => setUserMessage(e.target.value)}
                  placeholder="e.g., How much money will it cost for a bread with delivery charge?"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 text-sm mt-2"
              >
                <Send size={16} /> Submit on Website
              </button>
            </form>
          </div>
        )}

        {/* PAGE 2: TRACK & REPLY */}
        {activeTab === 'tracker' && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-1">Track Inquiry & Channel Reply</h2>
              <p className="text-sm text-slate-400 mb-4">
                See where the message came from, where the reply is sent (Website vs Email), and how all 6 agents solved it.
              </p>
              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={16} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    value={trackSearchId}
                    onChange={(e) => setTrackSearchId(e.target.value)}
                    placeholder="Enter Ticket ID (e.g., TKT-1001)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTrackSearchId(t.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-mono border ${
                        trackedTicket.id === t.id
                          ? 'bg-red-600 border-red-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {trackedTicket && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="flex justify-between items-start border-b border-slate-800 pb-4 gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs bg-red-500/15 text-red-400 px-2.5 py-1 rounded-md font-bold">
                        {trackedTicket.id}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-md font-semibold bg-slate-800 text-slate-200">
                        Source: {trackedTicket.channel}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-md font-semibold ${
                          trackedTicket.classification === 'Complaint'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {trackedTicket.classification}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-md font-semibold bg-amber-500/15 text-amber-300">
                        Urgency: {trackedTicket.urgency}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold mt-2">{trackedTicket.customer}</h3>
                    <p className="text-sm text-slate-300 mt-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                      "{trackedTicket.message}"
                    </p>
                  </div>
                  <StatusBadge status={trackedTicket.status} />
                </div>

                {trackedTicket.escalatedToHuman && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3 text-amber-200 text-sm">
                    <UserCheck size={18} className="text-amber-400 shrink-0" />
                    <span>
                      <strong>Human Escalation:</strong> Routed to a human specialist while sending status update via {trackedTicket.deliveryTarget}.
                    </span>
                  </div>
                )}

                <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                      <MessageSquare size={18} /> Reply Sent ({trackedTicket.deliveryTarget})
                    </span>
                  </div>
                  <p className="text-base text-white mt-2 leading-relaxed">
                    {trackedTicket.reply}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-slate-300 mb-3">
                    6-Agent Fast Resolution Log
                  </h4>
                  <div className="space-y-2.5">
                    {trackedTicket.pipeline.slice(0, trackedTicket.stage).map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 bg-slate-950 border border-slate-800 p-3.5 rounded-xl text-xs text-slate-300"
                      >
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-white">{item.agent}: </span>
                          <span>{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PAGE 3: EMAIL INBOX & SENT EMAIL REPLIES */}
        {activeTab === 'inbox' && (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Incoming Emails</h2>
              <p className="text-sm text-slate-400">
                Incoming emails are processed through all 6 agents and replied back directly to the sender's email.
              </p>
              <div className="space-y-3">
                {emails.map((em) => (
                  <div
                    key={em.id}
                    className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-white">{em.name}</span> ({em.from}) • {em.time}
                      </div>
                      <h3 className="font-semibold text-base mt-1">{em.subject}</h3>
                      <p className="text-sm text-slate-400 mt-1">{em.body}</p>
                    </div>
                    <button
                      disabled={em.processed}
                      onClick={() => handleEmailIngest(em)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-semibold shrink-0 ${
                        em.processed
                          ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                          : 'bg-red-600 hover:bg-red-500 text-white'
                      }`}
                    >
                      {em.processed ? '✓ Replied via Email' : 'Run 6 Agents & Reply Email →'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-bold">Sent Email Replies ({emailReplies.length})</h3>
              {emailReplies.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-sm space-y-1"
                >
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>To: {t.customerEmail || t.customer} • Ticket {t.id}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-emerald-300 pt-1">{t.reply}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE 4: TICKET QUEUE */}
        {activeTab === 'queue' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-lg font-bold">Central Ticket Queue</h2>
              <span className="text-xs text-slate-400">
                {resolvedCount} resolved • {escalatedCount} escalated to human
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-400 text-xs">
                <tr>
                  <th className="p-4">Ticket ID</th>
                  <th className="p-4">Source</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Message</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => {
                      setTrackSearchId(t.id);
                      setActiveTab('tracker');
                    }}
                    className="hover:bg-slate-800/50 cursor-pointer"
                  >
                    <td className="p-4 font-mono text-red-400 font-semibold">{t.id}</td>
                    <td className="p-4">{t.channel}</td>
                    <td className="p-4">{t.classification}</td>
                    <td className="p-4 font-medium">{t.customer}</td>
                    <td className="p-4 text-slate-300 max-w-md truncate">{t.message}</td>
                    <td className="p-4">
                      <StatusBadge status={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGE 5: 6-AGENT PIPELINE */}
        {activeTab === 'monitor' && activeTicket && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex justify-between items-start border-b border-slate-800 pb-4 gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-red-500/15 text-red-400 px-2.5 py-1 rounded-md font-bold">
                    {activeTicket.id}
                  </span>
                  <span className="text-xs text-slate-400">
                    {activeTicket.channel} • {activeTicket.classification} • Urgency: {activeTicket.urgency}
                  </span>
                </div>
                <h2 className="text-xl font-bold mt-2">{activeTicket.customer}</h2>
                <p className="text-sm text-slate-300 mt-1">"{activeTicket.message}"</p>
              </div>
              <StatusBadge status={activeTicket.status} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeTicket.pipeline.map((item, idx) => {
                const isDone = activeTicket.stage >= idx + 1;
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition ${
                      isDone
                        ? 'bg-slate-800/70 border-emerald-500/40'
                        : 'bg-slate-950 border-slate-800 opacity-45'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm flex items-center gap-2">
                        <Bot size={16} className="text-red-400" /> {item.agent}
                      </span>
                      {isDone ? (
                        <CheckCircle2 size={16} className="text-emerald-400" />
                      ) : (
                        <Clock size={16} className="text-slate-500" />
                      )}
                    </div>
                    <p className="text-xs text-slate-300">{item.detail}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PAGE 6: COMPANY DATA */}
        {activeTab === 'systems' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-4">QuickKart Reference Data</h2>
            <div className="flex gap-2 mb-6 flex-wrap">
              {['Catalog & Fees', 'Escalation Rules'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDbTab(tab)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                    dbTab === tab
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-950 text-slate-400 border border-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2">
              <p className="text-emerald-400">// Active View: {dbTab}</p>
              <p>Bread: ₹40 | Milk: ₹30 | Eggs: ₹72 | Rice: ₹120 | Butter: ₹58 | Coffee: ₹145 | Delivery: ₹{STANDARD_DELIVERY_FEE}</p>
              <p>Escalation_Triggers: Amount &gt;= ₹1000 | Fraud / Unauthorized | Health / Safety | Human Request</p>
            </div>
          </div>
        )}

        {/* PAGE 7: KNOWLEDGE BASE */}
        {activeTab === 'kb' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Support Knowledge Base</h2>
            <div className="grid gap-4">
              {KB_ARTICLES.map((doc) => (
                <div key={doc.id} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-red-400">
                      {doc.id} • {doc.tag}
                    </span>
                    <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full">
                      Match {doc.score}
                    </span>
                  </div>
                  <h3 className="font-bold text-base mt-1">{doc.title}</h3>
                  <p className="text-sm text-slate-400 mt-1">{doc.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE 8: LIVE SUMMARY */}
        {activeTab === 'analytics' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">Live Session Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <p className="text-xs text-slate-400">Total Messages</p>
                <p className="text-2xl font-bold mt-1">{totalCount}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <p className="text-xs text-slate-400">Complaints</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{complaintCount}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <p className="text-xs text-slate-400">Enquiries</p>
                <p className="text-2xl font-bold text-sky-400 mt-1">{enquiryCount}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <p className="text-xs text-slate-400">Escalated to Human</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{escalatedCount}</p>
              </div>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <p className="text-xs text-slate-400">Resolved</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{resolvedCount}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}