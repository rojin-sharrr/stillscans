/** Guide content. Follows the brief: plain English, short sentences, facts over fear. */

export interface GuideSection {
  id: string;
  title: string;
  body: string[];
  list?: string[];
}

export interface Guide {
  slug: string;
  /** The search phrase the page targets. */
  title: string;
  description: string;
  intro: string;
  sections: GuideSection[];
  faqs: { q: string; a: string }[];
}

export const guides: Guide[] = [
  {
    slug: "why-qr-code-stopped-working",
    title: "Why did my QR code stop working?",
    description:
      "The most common reasons a QR code stops working, how to find out which one applies to yours, and how to fix it without reprinting everything.",
    intro:
      "Most often, the code was made with a QR service that stopped forwarding scans. It can also be a moved page or a printing problem. Here's how to tell which one you have.",
    sections: [
      {
        id: "trial-ended",
        title: "The company running the code stopped forwarding scans",
        body: [
          "Many QR generators make dynamic codes. A dynamic code doesn't hold your link. It holds a short link to the company's server, which forwards each scan to your page.",
          "If that company stops forwarding, the code stops too. This can happen when a trial or plan ends, depending on the company's policy. The printed code looks exactly the same, which is why it's such a surprise.",
        ],
      },
      {
        id: "page-moved",
        title: "The page it opens has moved",
        body: [
          "A static code holds your link directly, so no company can switch it off. But if the page moves or the website closes, scans lead nowhere. Check the link in a browser. If the page is gone, restoring it fixes every printed code.",
        ],
      },
      {
        id: "cant-be-read",
        title: "The camera can't read it",
        body: [
          "If the phone doesn't react at all, the problem is the print rather than the link. Common causes are low contrast, a code printed too small, glare, or damage. Our guide to a QR code not scanning covers these.",
        ],
      },
      {
        id: "what-to-do",
        title: "What to do next",
        body: ["Start by checking the code. Then:"],
        list: [
          "If a company runs the code, it's the only one that can turn it back on. Contact them, or replace the code.",
          "If you can't reprint, put a new code on a sticker the same size as the old one.",
          "Use a code that doesn't depend on a trial, so this doesn't happen again.",
        ],
      },
    ],
    faqs: [
      {
        q: "Can I fix a deactivated code myself?",
        a: "Only the company running the redirect can turn it back on. If they won't, you'll need a new code. A sticker over the old one saves reprinting.",
      },
      {
        q: "How can I tell who controls my code?",
        a: "Check it with the tool on this page. We follow the link and show which company each step belongs to.",
      },
      {
        q: "Will it happen again?",
        a: "A static code can't be switched off. A StillScans permanent code keeps working even if you stop paying.",
      },
    ],
  },
  {
    slug: "do-qr-codes-expire",
    title: "Do QR codes expire?",
    description:
      "Static QR codes don't expire. Dynamic QR codes can stop working if the company behind them stops forwarding scans. Here's how to tell which you have.",
    intro:
      "A QR code itself doesn't have an expiry date. Whether it keeps working depends on where its link points, and who controls that link.",
    sections: [
      {
        id: "static",
        title: "Static QR codes don't expire",
        body: [
          "A static code holds your link inside the pattern. There's no company in the middle, so it works as long as the page it opens stays online.",
        ],
      },
      {
        id: "dynamic",
        title: "Dynamic QR codes can stop",
        body: [
          "A dynamic code holds a short link to another company's server, which forwards each scan. That's what lets you change the destination and see scan counts.",
          "It also means the code depends on that company. What happens when a plan ends varies by provider. Some keep forwarding, some add limits, and some stop. Our provider directory lists what each company's own pages say.",
        ],
      },
      {
        id: "how-to-tell",
        title: "How to tell which you have",
        body: [
          "Point your phone camera at the code and read the link preview before tapping it. If it shows your own website, it's probably static. If it shows a QR company's domain, it's dynamic. The checker on this page can confirm it.",
        ],
      },
    ],
    faqs: [
      {
        q: "Do free QR codes expire?",
        a: "Free static codes don't. Free dynamic codes depend on the company's policy, so check what happens when a trial or plan ends.",
      },
      {
        q: "How long does a static QR code last?",
        a: "As long as it stays readable and the page it opens stays online.",
      },
      {
        q: "Do StillScans codes expire?",
        a: "No. Static codes are free and unlimited, and permanent codes keep working even if you stop paying.",
      },
    ],
  },
  {
    slug: "static-vs-dynamic-qr-codes",
    title: "Static vs dynamic QR codes",
    description:
      "The difference between static and dynamic QR codes, what each one is good for, and how to choose before you print.",
    intro:
      "Both look the same on paper. The difference is whether anyone sits between the scan and your page.",
    sections: [
      {
        id: "static",
        title: "Static: the link is inside the code",
        body: [
          "The code holds your link directly. A scan opens your page with nothing in between.",
        ],
        list: [
          "Works without any company or account",
          "Can't be edited after printing",
          "No scan counts",
        ],
      },
      {
        id: "dynamic",
        title: "Dynamic: a short link forwards each scan",
        body: ["The code holds a short link. A server forwards each scan to your page."],
        list: [
          "Change the destination without reprinting",
          "See how many scans you get",
          "Depends on the company running the short link",
        ],
      },
      {
        id: "choosing",
        title: "Which should you choose?",
        body: [
          "Choose static if the link will never change, such as your home page. Choose dynamic if it might, such as a menu, a listing or a campaign. If you choose dynamic, check what happens when you stop paying before you print.",
        ],
      },
    ],
    faqs: [
      {
        q: "Can I turn a static code into a dynamic one?",
        a: "No. A static code's link is fixed in the pattern, so you'd need a new code.",
      },
      {
        q: "Are dynamic codes less reliable?",
        a: "They work the same when scanned, but they depend on the service that forwards them. That's why its policy matters.",
      },
      {
        q: "Which is easier to scan?",
        a: "Shorter links make simpler patterns. A dynamic code's short link can scan more easily than a static code holding a very long link.",
      },
    ],
  },
  {
    slug: "qr-code-not-scanning",
    title: "QR code not scanning? How to fix it",
    description:
      "Why a QR code won't scan, from low contrast and small print to glare and damage, with quick fixes for each.",
    intro:
      "If the camera doesn't react, the phone usually can't read the pattern. Work through these in order. Most have a quick fix.",
    sections: [
      {
        id: "phone",
        title: "Try the easy fixes first",
        body: [],
        list: [
          "Clean the camera lens",
          "Hold steady, and move a little closer or further away",
          "Get all three corner squares in the frame",
          "Find even light and avoid glare",
          "Try another phone to rule out your own",
        ],
      },
      {
        id: "print",
        title: "Check the print",
        body: [],
        list: [
          "Too small: make it bigger. Around 2 cm (0.8 in) is a common minimum for close-up scanning, and larger for a distance.",
          "Low contrast: use a dark code on a light background.",
          "Inverted colors: some phones struggle with light codes on dark backgrounds.",
          "No margin: leave clear space around the code.",
          "Blurry: print from an SVG or a high-resolution PNG.",
          "Too much covered: a large logo can hide too much of the pattern.",
        ],
      },
      {
        id: "damage",
        title: "Check for damage",
        body: [
          "Creases, scratches, curved surfaces and shiny lamination can all break up the pattern. Codes can recover from some damage, but not all of it.",
        ],
      },
      {
        id: "scans-but-fails",
        title: "If it scans but the page fails",
        body: [
          "Then the code is fine and the link is the problem. The page may have moved, or a redirect service may have stopped forwarding. Our guide on why a QR code stopped working explains what to do.",
        ],
      },
    ],
    faqs: [
      {
        q: "Why does it scan on one phone but not another?",
        a: "Cameras differ, so a code that's small or low contrast can work on some phones and not others. A bigger, higher-contrast code fixes this.",
      },
      {
        q: "How big should a QR code be?",
        a: "Bigger is safer. Allow more size the further away people will scan it from, and test a printed sample before a full run.",
      },
      {
        q: "Can I test a code before printing?",
        a: "Yes. StillScans reads every design back before you can download it, and you should still test a printed sample.",
      },
    ],
  },
];
