# Scriba copy (bn + en)

Every user-facing string, for the `src/lib/i18n` dictionary (B1). Generated from the Claude Design prototypes on 31 Oct 2026 (D4); regenerate rather than hand-edit when the prototypes change.

Rules: plain everyday words, respectful আপনি, short sentences. Explain a problem as arithmetic he can check. Names, items, units and anything read from the khata are the user's words and are never translated. Bangla mode uses Bangla digits; English mode uses Latin digits; both use lakh grouping (৳১,২৩,৪৫০ / ৳1,23,450). `{1}`, `{2}` are inserted by code (numbers already formatted).

## Part 1: D4 screens (onboarding, history, more, learning, empty and error states, kit labels)

Keys are the ones the app should use. Source: `proto/copy.js` and `proto/more-kit.jsx` in the Claude Design project.

| Key | বাংলা | English |
|---|---|---|
| `back` | ফিরে যান | Back |
| `next` | পরের ধাপ | Next |
| `retry` | আবার চেষ্টা করুন | Try again |
| `retake` | আবার ছবি তুলুন | Take the photo again |
| `sample` | নমুনা দোকান | Sample shop |
| `sample.title` | এটা নমুনা হিসাব, কোনো আসল দোকানের না | These are sample figures, not a real shop's |
| `step` | ধাপ {১} / {২} | Step {1} of {2} |
| `tab.today` | আজ | Today |
| `tab.khata` | খাতা | History |
| `tab.dues` | বাকি | Dues |
| `tab.more` | আরও | More |
| `tab.camera` | ছবি তুলুন | Take a photo |
| `ob.kicker` | নতুন হালখাতা | A new halkhata |
| `ob.title` | খাতা আপনার, হিসাব মেলাবে Scriba | Your khata. Scriba does the sums. |
| `ob.body` | যেভাবে খাতা লেখেন, সেভাবেই লিখুন। পাতার ছবি তুললে Scriba পড়ে হিসাব মিলিয়ে দেবে। | Keep writing your khata the way you always have. Photograph a page and Scriba reads it and checks the sums. |
| `ob.lang` | কোন ভাষায় দেখবেন? | Which language? |
| `ob.lang.note` | পরে ‘আরও’ থেকে বদলানো যাবে। | You can change this later in More. |
| `lang.bn` | বাংলা | বাংলা |
| `lang.en` | English | English |
| `how.title` | Scriba কীভাবে কাজ করে | How Scriba works |
| `how.1.t` | পাতার ছবি তুলুন | Photograph the page |
| `how.1.b` | একসাথে কয়েকটা পাতাও তোলা যায়। | You can take several pages in a row. |
| `how.2.t` | লেখা পড়ে AI, হিসাব মেলায় কোড | AI reads, code does the sums |
| `how.2.b` | গুণ, যোগ আর বাকি মেলায় কোড। কোনো সংখ্যা আন্দাজে বসানো হয় না। | Multiplying, totals and dues are worked out by code. No number is guessed. |
| `how.3.t` | শেষ কথা আপনার | You have the final say |
| `how.3.b` | প্রতিটা লাইন নিজের লেখার পাশে দেখে নেবেন। আপনি ঠিক বললে তবেই হিসাবে ঢোকে। | You check every line next to your own handwriting. Only lines you approve count. |
| `how.demo` | উপরে আপনার লেখা, নিচে Scriba যা পড়েছে | Your handwriting on top, Scriba's reading below |
| `shop.title` | দোকানের নাম কী? | What is your shop called? |
| `shop.hint` | দিনের হিসাবে আর বাকির খবরে এই নাম থাকবে। | It appears on your daily summary and on reminders. |
| `shop.ph` | যেমন: মায়ের দোয়া স্টোর | For example: Mayer Doa Store |
| `cash.title` | আজ সকালে ক্যাশবাক্সে কত টাকা ছিল? | How much cash was in the drawer this morning? |
| `cash.hint` | এখান থেকে আজকের হিসাব শুরু হবে। ঠিক না জানলে ০ রাখুন, পরে বদলানো যাবে। | Today's count starts from here. If you're not sure, leave 0 and change it later. |
| `ob.go` | খাতা খুলুন | Open my khata |
| `today.title` | আজ, {1} | Today, {1} |
| `today.drawer` | ক্যাশবাক্সে থাকা উচিত | Should be in the drawer |
| `today.onlyMorning` | এখনো শুধু সকালের টাকা | Only this morning's cash so far |
| `empty.today.t` | আজ এখনো কোনো পাতা নেই | No pages yet today |
| `empty.today.b` | নিচের লাল বোতাম চেপে আজকের প্রথম পাতার ছবি তুলুন। পড়া আর মেলানো হলে এখানে বিক্রি, বাকি আর খরচ দেখাবে। | Press the red button below to photograph today's first page. Once it is read and checked, your sales, dues and costs appear here. |
| `empty.today.cta` | প্রথম পাতার ছবি তুলুন | Photograph the first page |
| `kh.title` | খাতা | History |
| `kh.search` | নাম বা পাতা খুঁজুন | Search names or pages |
| `kh.week` | এই সপ্তাহ | This week |
| `kh.pages` | {১}টি পাতা | {1} pages |
| `kh.lines` | {১}টি লাইন | {1} lines |
| `kh.sales` | বিক্রি {1} | Sales {1} |
| `kh.page` | পাতা {১} | Page {1} |
| `kh.sealed` | হিসাব মিলেছে | Balanced |
| `kh.checked` | দেখা হয়েছে | Checked |
| `kh.waiting` | দেখা বাকি | Not checked yet |
| `kh.closed` | দিন বন্ধ, ক্যাশ মিলেছে | Day closed, cash matched |
| `kh.short` | দিন বন্ধ, {1} কম ছিল | Day closed, {1} short |
| `kh.notClosed` | দিন বন্ধ করা হয়নি | Day not closed |
| `kh.dayPages` | এই দিনের পাতা | Pages from this day |
| `kh.waitNote` | দেখা বাকি পাতার লাইন কোনো হিসাবে ধরা হয়নি। | Lines on unchecked pages are not counted anywhere. |
| `kh.openDay` | দিনের হিসাব দেখুন | See the day's summary |
| `kh.results` | “{2}”: {১}টি লাইন | {1} lines for “{2}” |
| `kh.none.t` | “{1}” খাতায় পাওয়া যায়নি | Nothing found for “{1}” |
| `kh.none.b` | নামটা অন্য বানানে লেখা থাকতে পারে। নামের প্রথম অংশ দিয়ে খুঁজুন। | The name may be spelled differently. Try the first part of it. |
| `empty.kh.t` | খাতা এখনো খালি | Your history is empty |
| `empty.kh.b` | যে পাতার ছবি তুলবেন আর মিলিয়ে নেবেন, তা এখানে দিন ধরে জমা থাকবে। | Every page you photograph and check is kept here, day by day. |
| `more.title` | আরও | More |
| `more.shop` | দোকান | Shop |
| `more.shopName` | দোকানের নাম | Shop name |
| `more.morning` | সকালের ক্যাশ | Morning cash |
| `more.morning.sub` | কাল দিন বন্ধের সময় গোনা টাকা | Counted when you closed yesterday |
| `more.lang` | ভাষা | Language |
| `more.learn.t` | Scriba আপনার লেখা শিখছে | Scriba is learning your handwriting |
| `more.learn.b` | আপনার {১}টি সংশোধন থেকে | From {1} of your corrections |
| `more.print.t` | Scriba খাতার পাতা ছাপুন | Print Scriba khata pages |
| `more.print.b` | ঘর কাটা পাতা, পড়তে আরও সহজ | Ruled pages that are easier to read |
| `more.details` | বিস্তারিত | Details |
| `more.details.b` | প্রতিটা ছবি, পড়া আর সংশোধনের পুরো রেকর্ড | The full record of every photo, reading and correction |
| `more.photos` | সব ছবি | All photos |
| `more.records` | মিলিয়ে নেওয়া লাইন | Confirmed lines |
| `more.eval` | পড়া কতটা ঠিক হয় | How accurate the reading is |
| `more.sampleNote` | এটা নমুনা দোকান। এর সব হিসাব বানানো, কোনো আসল দোকানের না। | This is a sample shop. All its figures are made up, not from a real shop. |
| `more.signout` | বের হন | Sign out |
| `learn.title` | আপনার লেখা শেখা | Learning your handwriting |
| `learn.lead` | যেখানে Scriba ভুল পড়েছিল আর আপনি ঠিক করেছেন, সেখান থেকে শেখে। | Scriba learns from the places where it misread and you corrected it. |
| `learn.stats` | শেষ {২}টি পাতায় আপনি {১}টি সংখ্যা ঠিক করেছেন। | You corrected {1} numbers on the last {2} pages. |
| `learn.mix` | যে সংখ্যা বেশি গুলিয়ে যায় | Digits it mixes up most |
| `learn.mixRow` | আপনার {1} কে {2} পড়েছিল · {৩} বার | Read your {1} as {2} · {3} times |
| `learn.refs` | Scriba এই লাইনগুলো দেখে আপনার লেখা চেনে | Scriba uses these lines to recognise your writing |
| `learn.refs.b` | আপনার মিলিয়ে নেওয়া লাইন থেকে বাছা। | Chosen from lines you confirmed. |
| `learn.use` | নতুন পাতা পড়তে এটা কাজে লাগান | Use this when reading new pages |
| `learn.use.b` | এখনো পরীক্ষা চলছে। চালু করলেও প্রতিটা লাইন আগের মতোই মেলানো হবে, আর আপনি দেখে নেবেন। | Still being tested. Even when it is on, every line is still checked and you still approve it. |
| `learn.on` | চালু | On |
| `learn.off` | বন্ধ | Off |
| `learn.honest` | লক্ষ্য হলো কম ভুল পড়া। তবু ভুল হলে তা হিসাব মেলাতে গিয়ে বা আপনার দেখায় ধরা পড়বে। | The aim is fewer misreads. When one still happens, the sums or your own check will catch it. |
| `learn.empty` | এখনো শেখার মতো কিছু নেই। আপনি কোনো সংখ্যা ঠিক করলে এখানে দেখাবে। | Nothing to learn from yet. When you correct a number, it shows up here. |
| `empty.dues.t` | কারো কাছে বাকি নেই | Nobody owes you anything |
| `empty.dues.b` | বাকিতে বিক্রি বা জমার লাইন মিলিয়ে নিলে এখানে কে কত দেবে দেখাবে। | When you check lines for credit sales or payments, you'll see who owes what here. |
| `nothing.title` | পাতা ১ | Page 1 |
| `nothing.t` | এই পাতায় কোনো হিসাবের লাইন পাওয়া যায়নি | No accounts lines found on this page |
| `nothing.b` | পাতাটা খালি, বা হিসাবের বাইরের কিছু লেখা থাকতে পারে। ছবিতে লাইন থাকলে নিজে যোগ করুন। | The page may be blank, or hold something other than accounts. If the photo has lines, add them yourself. |
| `nothing.add` | নিজে লাইন যোগ করুন | Add a line yourself |
| `nothing.safe` | কিছুই হিসাবে ঢোকেনি। | Nothing was added to your accounts. |
| `prob.kept` | আপনার ছবি রাখা আছে। আপনার হিসাবে কিছু বদলায়নি। | Your photo is kept. Nothing in your accounts changed. |
| `prob.tips` | পরের বার | Next time |
| `unreadable.t` | লেখা পড়া গেল না | Couldn't read the writing |
| `unreadable.b` | ছবিটা ঝাপসা, অন্ধকার বা অনেক দূর থেকে তোলা হতে পারে। | The photo may be blurry, dark, or taken from too far away. |
| `tip.light` | আলোর দিকে মুখ করে তুলুন | Face the light |
| `tip.fill` | পাতাটা পুরো ফ্রেমে আনুন | Fill the frame with the page |
| `tip.still` | ফোন স্থির রেখে এক মুহূর্ত অপেক্ষা করুন | Hold the phone still for a moment |
| `small.t` | ছবিটা খুব ছোট | This photo is too small |
| `small.b` | এত ছোট ছবিতে হাতের লেখা পড়া যায় না। ক্যামেরা দিয়ে সরাসরি তুলুন। | Handwriting can't be read from a photo this small. Take it with the camera instead. |
| `side.t` | লেখা সোজা দেখাচ্ছে তো? | Is the writing the right way up? |
| `side.b` | পাতাটা কাত বা উল্টো থাকলে ঘুরিয়ে দিন, তারপর পাঠান। | If the page is sideways or upside down, turn it, then send. |
| `side.turn` | ঘুরিয়ে দিন | Turn |
| `side.ok` | সোজা আছে, পাঠান | It's upright, send |
| `offline.t` | ইন্টারনেট নেই | No internet |
| `offline.b` | পাতা পড়তে নেট লাগে। ছবিগুলো এই পর্দায় আছে; নেট এলে আবার চেষ্টা করুন। | Reading a page needs the internet. Your photos are still on this screen; try again when you're back online. |
| `offline.note` | এই পর্দা বন্ধ করলে ছবিগুলো মুছে যাবে। | Closing this screen discards the photos. |
| `failed.t` | এবার পড়া গেল না | Reading didn't work this time |
| `failed.b` | Scriba-র পড়ার সার্ভিস সাড়া দেয়নি। এটা আপনার ছবির দোষ না। | Scriba's reading service didn't answer. It's not a problem with your photo. |
| `busy.t` | একটু পরে চেষ্টা করুন | Please try again shortly |
| `busy.b` | এখন অনেক পাতা একসাথে পড়া হচ্ছে। এক মিনিট পরে আবার চেষ্টা করুন। | A lot of pages are being read right now. Try again in a minute. |
| `waiting.t` | আগের পড়াটা এখনো আসেনি | The last reading hasn't arrived |
| `waiting.b` | একই পাতা আবার পড়ানোর আগে এক মিনিট অপেক্ষা করুন, যাতে দুবার পড়া না হয়। | Wait a minute before reading this page again, so it isn't read twice. |
| `waiting.cta` | আবার দেখুন | Check again |
| `file.t` | এই ছবিটা খোলা যাচ্ছে না | This file can't be opened |
| `file.b` | iPhone-এর HEIC ছবি বা অন্য ধরনের ফাইল এখনো চলে না। ক্যামেরা বোতাম দিয়ে সরাসরি তুলুন, বা JPG ছবি দিন। | HEIC photos from iPhone and other file types don't work yet. Use the camera button, or choose a JPG. |
| `eq.qty` | পরিমাণ | Qty |
| `eq.rate` | দর | Rate |
| `eq.amount` | টাকা | Amount |
| `key.del` | মুছুন | Delete |
| `key.clear` | সব মুছুন | Clear |
| `from.photo` | ছবি থেকে | From photo |
| `type.cash_sale` | নগদ বিক্রি | Cash sale |
| `type.credit_sale` | বাকিতে বিক্রি | Sold on credit |
| `type.repayment` | বাকির জমা | Paid back |
| `type.purchase` | নগদে মাল কেনা | Stock bought |
| `type.credit_purchase` | বাকিতে মাল কেনা | Stock on credit |
| `type.supplier_payment` | মহাজনকে দেওয়া | Paid supplier |
| `type.expense` | খরচ | Expense |

## Part 2: D2 and D3 screens (Bangla as designed)

Extracted from the prototype files; B1–B5 give each a key when they port the screen. English for the two densest screens is in `proto/screens-en.jsx` (Today, check card) and was checked at 390 px. The rest have no English yet: translate them in the same plain register when building the dictionary (see design/DESIGN_SPEC.md, "English").

### D2 kit (`proto/kit.jsx`)

- ফিরে যান
- ছবি থেকে
- হিসাব মিলেছে
- হিসাব
- মিলেছে
- মুছুন
- সব মুছুন
- আজ
- খাতা
- ছবি তুলুন
- বাকি
- আরও
- টাকা
- পরিমাণ
- দর

### D2 capture, reading, reveal (`proto/screens-capture.jsx`)

- বন্ধ করুন
- পুরো পাতা ফ্রেমের ভেতরে রাখুন
- তোলা পাতা এখানে জমা হবে
- ↻ ঘোরান
- গ্যালারি
- ছবি তুলুন
- পড়তে দিন (${S.bn(pages.length)})
- পড়তে দিন
- ছবি পাঠানো হচ্ছে
- ছবি পাঠানো হয়েছে
- লেখা পড়া হচ্ছে
- লেখা পড়া হয়েছে
- হিসাব মিলিয়ে দেখা হচ্ছে
- হিসাব মিলিয়ে দেখা হয়েছে
- পাতা পড়া হচ্ছে
- পাতা ১ / ১
- সাধারণত এক মিনিটের কম লাগে।
- লেখা পড়ে AI, হিসাব মেলায় কোড, শেষ কথা আপনার।
- পড়া হয়েছে
- পাতা ১ · ${S.page.party} · ${S.page.date}
- একটা একটা করে দেখুন
- হিসাব মেলানো হচ্ছে…

### D2 check deck, fix sheet (`proto/screens-deck.jsx`)

- পরিমাণ
- দর
- টাকা
- ঠিক আছে
- দেখা হয়েছে ✓
- লাইন ${S.bn(S.lines.indexOf(line) + 1)}
- এই লাইনে আলাদা কোনো সমস্যা পাওয়া যায়নি।
- (বলে)
- এখন হিসাব মিলেছে।
- একটা একটা করে দেখুন
- পাতা ১ · ${S.page.party}
- লাইন
- লাইন ${S.bn(i + 1)}
- ${S.bn(left)}টি দেখার বাকি
- সমস্যার সব লাইন দেখা হয়েছে
- সংখ্যায় চাপ দিলে ঠিক করা যায়
- ঠিক থাকলে কার্ডটা ডানে সরান →
- ঠিক করুন
- খাতায় এটাই লেখা
- ঠিক আছে ✓
- মুছুন
- সব মুছুন
- ${line.label} ঠিক করুন
- বন্ধ করুন
- শুনেছি “${heard.said}”। ঠিক থাকলে “রাখুন” চাপুন।
- ছবিতে যা লেখা, সেটাই লিখুন।
- শুনছি… সংখ্যাটা বলুন, যেমন “আটশো”
- থামুন
- রাখুন

### D2 summary, confirm, seal (`proto/screens-end.jsx`)

- আপনি ${S.group(e.from)} থেকে ${S.group(e.to)} করেছেন।
- খাতায় যেমন লেখা, তেমন রাখা হলো।
- এখনো দেখা হয়নি।
- সারাংশ
- পাতা ১ · ${S.page.party} · ${S.page.date}
- , মিলেছে।
- হয়, লেখা ${S.group(close)}।
- আগে সব লাইন দেখুন (${S.bn(left)}টি বাকি)
- খাতায় তুলুন
- তোলার পর আজকের হিসাবে যোগ হবে।
- খাতায় তোলা হয়েছে
- পাতা ১ · ${S.page.party}
- পাতা ১ মিলেছে
- পাতা ১ তোলা হয়েছে
- ${S.bn(S.lines.length)}টি লাইন খাতায় উঠেছে। ${S.page.party}র বাকি এখন ৳${S.group(values.l6.amount)}।
- হিসাব মেলেনি: ${S.group(findings.calc)} হয়, লেখা ৳${S.group(values.l6.amount)}। পরে খাতা দেখে ঠিক করতে পারবেন।
- আরেকটা পাতা তুলুন
- আজকের হিসাব দেখুন

### D2 check sentences (ruleCopy, check()) (`proto/data.js`)

- ০১২৩৪৫৬৭৮৯
- করিম মিয়া
- ৩১/১০/২৬
- বাকির খাতা
- আগের বাকি
- ৮০০
- ৮ না ৪, পরিষ্কার না
- বাকিতে বিক্রি
- চাল
- কেজি
- চাল ৩ কেজি × ৬০
- ১৮০
- ডাল
- ডাল ১ কেজি × ১৪০
- ১৪০
- মোট
- ৩১০
- জমা
- ১০০
- শেষ বাকি
- বাকি
- ১,০২০
- আটশো
- তিনশো দশ
- Scriba নিশ্চিত না:
- ${bn(x.qty)} × ${group(x.rate)} = ${group(e)}, মিলেছে।
- ${bn(x.qty)} × ${group(x.rate)} = ${group(e)} হয়, কিন্তু পড়া হয়েছে ${group(x.amount)}।
- ${parts} = ${group(sum)}, মিলেছে।
- উপরের দুই লাইন যোগ করলে ${group(sum)} হয়, কিন্তু মোট লেখা ${group(sub)}।
- খাতায় ভুল লেখা থাকতে পারে। ছবিতে যা লেখা, তা-ই রাখুন।
- এই বাকি ধরে শেষ বাকি মিলেছে।
- এই জমা ধরে শেষ বাকি মিলেছে।
- ${eq}, মিলেছে।
- ${eq} হয়, কিন্তু শেষ বাকি লেখা ${group(close)}।
- হিসাব মিলতে হলে এখানে ${group(need)} হওয়া দরকার। ছবির সাথে মিলিয়ে দেখুন।
- পরিমাণ × দর
- ২ × ৯৫ = ১৯০ হয়, কিন্তু পড়া হয়েছে ১৮০।
- উপরের দুই লাইন যোগ করলে ৩২০ হয়, কিন্তু মোট লেখা ৩১০।
- ৮০০ + ৩২০ − ১০০ = ১,০২০ হয়, কিন্তু শেষ বাকি লেখা ১,২০০।
- লাইনের বাকি
- আগের বাকি ৯২০ থেকে ১০০ জমা গেলে ৮২০ হয়, কিন্তু লেখা ৮৫০।
- আগের পাতা
- আগের পাতার শেষ বাকি ১,০২০, কিন্তু এই পাতার আগের বাকি লেখা ১,২০০।
- সংখ্যা
- এই সংখ্যাটা পরিষ্কার পড়া যায়নি। ছবি দেখে লিখে দিন।
- নিশ্চিত না
- Scriba নিশ্চিত না: ৮ না ৪, পরিষ্কার না।
- লাইনের ধরন
- এটা বিক্রি, জমা না খরচ, বোঝা যায়নি। একটা বেছে নিন।
- মেলানো গেল না
- দর লেখা নেই, তাই গুণ করে মেলানো গেল না।

### D3 money kit (`proto/money-kit.jsx`)

- এটা নমুনা হিসাব, কোনো আসল দোকানের না
- নমুনা দোকান
- ফিরে যান
- ${label}: ${hero}। কীভাবে হলো দেখুন
- ছবি নেই · নমুনা লাইন
- ছবি থেকে: ${left}, ${right}
- ছবি থেকে
- গড়
- ${d.wd}, ${d.date}: বিক্রি ${H.tk(d.n)}
- সাত দিনের বিক্রি
- থাকার কথা
- ‹ ক্যাশবাক্সের হিসাব
- ক্যাশবাক্সের হিসাব
- ক্যাশবাক্সে থাকা উচিত
- যেকোনো সারিতে চাপ দিলে তার খাতার লাইন দেখবেন।
- বাকিতে বিক্রির টাকা ক্যাশবাক্সে আসে না, তাই এখানে ধরা হয়নি।
- ${S.bn(d.recs.length)}টি লাইন · আজ · ${d.pages}
- এই ${S.bn(d.recs.length)}টি লাইন যোগ করে ${H.tk(d.total)}। যোগ করেছে কোড, আপনার মিলিয়ে নেওয়া লাইন থেকে।

### D3 Today (`proto/screens-today.jsx`)

- মাল কেনা
- মহাজনকে
- খরচ
- আজ, ${H.shop.today}
- ক্যাশবাক্সে থাকা উচিত
- সকালে ${S.group(H.shop.openingCash)} + নগদ বিক্রি ${S.group(d.cash)} + জমা ${S.group(d.repaid)} − কেনা ও খরচ ${S.group(d.out)}
- বিক্রি
- নগদ
- বাকিতে
- টাকা গেছে
- দিনের কথা
- Scriba-কে জিজ্ঞেস করুন
- দিনের হিসাব মেলান
- সাত দিনের বিক্রি
- মোট ${H.tk(w.total)} · আগের সাত দিনের চেয়ে ${H.tk(Math.abs(w.diff))} ${w.diff >= 0 ? "বেশি" : "কম"}
- মোট পাওনা
- ${S.bn(du.flagged)} জনের বাকি দেখা দরকার
- যেকোনো সংখ্যায় চাপ দিলে তার খাতার লাইন দেখবেন।
- আজকের হিসাব মিলেছে
- আজকের দিন বন্ধ হয়েছে
- গুনে পেয়েছেন ${H.tk(closed.counted)}। কাল এই টাকা দিয়ে শুরু হবে।
- গুনে পেয়েছেন ${H.tk(closed.counted)}, হিসাবের চেয়ে ${H.tk(Math.abs(gap))} ${gap < 0 ? "কম" : "বেশি"}।

### D3 Ask Scriba (`proto/screens-ask.jsx`)

- রহিম
- সাত দিন
- সপ্তাহ
- পুরনো
- নগদ
- আপনি জিজ্ঞেস করেছেন
- শুনছি… বলা শেষ হলে একটু থামুন
- বাদ দিন
- যে সাত দিনের খাতা থেকে
- যে ${S.bn(recs.length)}টি লাইন থেকে হিসাব
- আরও ${S.bn(recs.length - 2)}টি লাইন দেখুন
- হিসাব করেছে কোড, আপনার মিলিয়ে নেওয়া খাতার লাইন থেকে। AI শুধু প্রশ্নটা বুঝেছে।
- আরেকটা প্রশ্ন করুন
- এই প্রশ্নের উত্তর খাতায় নেই, তাই Scriba আন্দাজে কিছু বলবে না।
- খাতা নিয়ে এমন প্রশ্ন করতে পারেন:
- Scriba-কে জিজ্ঞেস করুন
- খাতার হিসাব নিয়ে যেকোনো প্রশ্ন, বলে বা লিখে।
- লিখে জিজ্ঞেস করুন…
- লিখে জিজ্ঞেস করুন
- বলে জিজ্ঞেস করুন
- যেমন

### D3 Close the day (`proto/screens-close.jsx`)

- হিসাব মিলেছে
- সব লাইন দেখা হয়েছে
- এখনো দেখা হয়নি
- পাতা ${S.bn(p.n)} · ${p.title}
- ${S.bn(p.lines)}টি লাইন · ${PAGE_STATE[p.state]}
- দেখুন
- গুনে পেয়েছেন
- থাকার কথা ছিল ${H.tk(expected)}। আজকের হিসাব মিলেছে।
- কোনো খরচ খাতায় লেখা হয়নি
- কোনো পাতার ছবি তোলা হয়নি
- খুচরা দিতে ভুল হয়েছে
- কোনো বিক্রি বা জমা খাতায় লেখা হয়নি
- আগের টাকা বাক্সে রয়ে গেছে
- গুনে পেয়েছেন ${H.tk(counted)}
- ${H.tk(Math.abs(gap))} ${gap < 0 ? "কম" : "বেশি"} আছে
- হিসাব অনুযায়ী থাকার কথা ${H.tk(expected)}। এমন হতে পারে:
- মুছুন
- সব মুছুন
- ক্যাশবাক্সে কত আছে
- ক্যাশবাক্সে কত আছে?
- নোট আর খুচরা গুনে মোট টাকা লিখুন।
- মিলিয়ে দেখুন
- দিনের হিসাব · ${H.shop.todayShort}
- ক্যাশবাক্সে থাকা উচিত
- পাতা ${S.bn(H.pendingPage.n)} এখনো দেখা হয়নি, তাই এর ${S.bn(H.pendingPage.lines)}টি লাইন এই হিসাবে নেই। টাকা গোনার আগে পাতাটা দেখে নিন।
- আজকের পাতা
- আরও পাতা থাকলে ছবি তুলুন
- কীভাবে হলো
- টাকা গুনে লিখুন
- আপনি গুনবেন, Scriba মিলিয়ে দেখাবে।
- দিন বন্ধ করুন
- কাল সকাল শুরু হবে ${H.tk(st.counted)} দিয়ে।
- ${H.tk(Math.abs(gap))} ${gap < 0 ? "কম" : "বেশি"} লিখে দিন বন্ধ করুন
- আবার গুনব

### D3 Dues, party ledger, reminder (`proto/screens-dues.jsx`)

- বাকি
- বাকির ধরন
- পাওনা
- দেনা
- ${S.bn(du.list.length)} জনের কাছে পাবেন
- ${S.bn(du.list.length)} জন মহাজনকে দিতে হবে
- যাদের বাকি আগে দেখা দরকার, তারা উপরে।
- যাদের অনেক দিন কিছু দেওয়া হয়নি, তারা উপরে।
- বাকিতে নিলেন
- জমা দিলেন
- বাকিতে মাল আনলেন
- টাকা দিলেন
- ক্রেতা · বাকির হিসাব
- মহাজন · দেনার হিসাব
- ${H.poss(p.short)} কাছে পাবেন
- ${p.short}কে দিতে হবে
- শেষ জমা
- শেষ দেওয়া
- এখনো নেই
- সবচেয়ে পুরনো বাকি
- মনে করিয়ে দিন
- খাতার লাইন
- · আজ
- পাতা ${S.bn(e.page.slice(1))}
- এরপর ${p.customer ? "বাকি" : "দেনা"} ${H.tk(e.balance)}
- ${p.call}, কেমন আছেন?
- ${H.loc(H.shop.name)} আপনার ${H.tk(p.balance)} বাকি আছে।
- শেষ জমা দিয়েছিলেন ${H.dateLabel(p.lastPay.ago)}।
- খাতার লাইনের ছবি সাথে দিলাম। সুবিধামতো দিয়ে গেলে খুশি হব।
- ${p.name}কে এই বার্তা যাবে
- খাতার ছবি সাথে যাবে
- ${S.bn(lines.length)}টি লাইন
- আরও ${S.bn(lines.length - 3)}টি লাইন একই ছবিতে
- কপি হয়েছে
- কপি করুন
- পাঠান
- ফোনের শেয়ার খুলেছে: হোয়াটসঅ্যাপ, ইমো বা মেসেজ বেছে নিন।
- পাঠান চাপলে ফোনের শেয়ার খুলবে। আপনি না পাঠালে কিছুই যাবে না। কপি করলে শুধু লেখাটা কপি হবে।

### D3 templates: note, risks, answers, types (`proto/shop.js`)

- নমুনা দোকান
- জানুয়ারি
- ফেব্রুয়ারি
- মার্চ
- এপ্রিল
- মে
- জুন
- জুলাই
- আগস্ট
- সেপ্টেম্বর
- অক্টোবর
- নভেম্বর
- ডিসেম্বর
- রবি
- সোম
- মঙ্গল
- বুধ
- বৃহঃ
- শুক্র
- শনি
- আজ
- গতকাল
- দিন আগে
- ের
- য়
- মায়ের দোয়া স্টোর
- শনিবার, ৩১ অক্টোবর
- ৩১ অক্টোবর
- নগদ বিক্রি
- বাকিতে বিক্রি
- বাকির জমা
- নগদে মাল কেনা
- বাকিতে মাল কেনা
- মহাজনকে দেওয়া
- খরচ
- রহিম উদ্দিন
- রহিম
- রহিম ভাই
- সুমাইয়া আপা
- বাবুল
- বাবুল ভাই
- করিম মিয়া
- করিম
- করিম ভাই
- শাহানা বেগম
- শাহানা
- শাহানা আপা
- জসিম
- জসিম ভাই
- নাসির
- নাসির ভাই
- মিনু দিদি
- আল-আমিন এন্টারপ্রাইজ
- আল-আমিন
- রফিক ট্রেডার্স
- রফিক
- হক স্টোর
- বাকি, জমা, কেনা, খরচ
- বিকেলের বিক্রি
- চাল
- কেজি
- ডাল
- সয়াবিন তেল
- লি
- চিনি
- আটা
- পেঁয়াজ
- ডিম
- ডজন
- সাবান
- টা
- বিস্কুট
- প্যাকেট
- জমা
- তেল
- কার্টন
- আল-আমিনকে দেওয়া
- ভ্যান ভাড়া
- চা-নাশতা
- বিদ্যুৎ বিল
- আজ · পাতা ${bn(r.page.slice(1))}
- ${poss(dateLabel(r.ago))} পাতা
- সকালে ক্যাশবাক্সে ছিল
- আজকের বিক্রি
- আজ টাকা গেছে
- পাতা
- ${bn(quiet)} দিন কোনো জমা নেই
- ${bn(quiet)} দিন কিছু দেওয়া হয়নি
- ৩ সপ্তাহ ধরে বাকি বাড়ছে
- একবারে ${tk(big.amount)} বাকি, সাধারণত ${tk(usual)}
- শেষ জমা
- শেষ দেওয়া
- এখনো কোনো জমা নেই
- এখনো কিছু দেওয়া হয়নি
- পাতা ${bn(pending.n)} এখনো দেখা হয়নি, তাই এর লাইন আজকের হিসাবে ধরা হয়নি।
- আজ বিক্রি ${tk(d.sales)}, এর মধ্যে ${tk(d.credit)} বাকিতে।
- ${poss(top.name)} ${tk(top.balance)} বাকি, ${top.risks[0].text}।
- এই সাত দিনে বিক্রি আগের সাত দিনের চেয়ে ${tk(w.diff)} বেশি।
- এই সাত দিনে বিক্রি আগের সাত দিনের চেয়ে ${tk(-w.diff)} কম।
- রহিমের কাছে কত বাকি?
- এই সাত দিনে কত বিক্রি হলো?
- কার বাকি সবচেয়ে পুরনো?
- আজ নগদে কত বিক্রি?
- কাল বৃষ্টি হবে?
- ${poss(p.name)} কাছে ${tk(p.balance)} বাকি। শেষ জমা ${dateLabel(p.lastPay.ago)}, ${agoLabel(p.lastPay.ago)}।
- ${poss(p.short)} খাতা খুলুন
- ${dateLabel(6)} থেকে আজ পর্যন্ত সাত দিনে বিক্রি ${tk(w.total)}। আগের সাত দিনের চেয়ে ${tk(w.diff)} বেশি।
- দিন
- ${poss(p.name)} ${poss(dateLabel(o.rec.ago))} বাকির ${tk(o.left)} এখনো শোধ হয়নি। ${bn(o.rec.ago)} দিন হলো।
- আজ নগদ বিক্রির ${bn(d.recs.cash_sale.length)}টি লাইন, যোগ ${tk(d.cash)}।

## Part 3: D5 scan and ask (bn + en)

Source: `proto/ask-data.js` (`T`) in the Claude Design project. Names, items, units and khata text in `{1}` slots are the user’s words and are never translated.

| Key | বাংলা | English |
|---|---|---|
| `asks` | Scriba জানতে চায় | Scriba asks |
| `scan.finding` | পাতা খুঁজছি… | Looking for the page… |
| `scan.found` | পাতা পেয়েছি · ফোন স্থির রাখুন | Page found · hold still |
| `scan.far` | পাতা ছোট দেখাচ্ছে · আরেকটু কাছে আনুন | The page looks small · come a little closer |
| `scan.khata` | Scriba খাতা · চার কোণ একদম ঠিক | Scriba khata · all four corners exact |
| `scan.auto` | নিজে থেকে তুলবে | Auto shutter |
| `on` | চালু | On |
| `off` | বন্ধ | Off |
| `scan.shutter` | ছবি তুলুন | Take the photo |
| `scan.tip` | পুরো পাতাটা ফ্রেমে রাখুন | Keep the whole page in the frame |
| `corners.title` | পাতার কোণ ঠিক আছে? | Are the corners right? |
| `corners.tip` | গোল দাগ টেনে পাতার আসল কোণে বসান। | Drag a dot onto the page's real corner. |
| `retake` | আবার তুলুন | Retake |
| `flatten` | সোজা করুন | Straighten |
| `flat.title` | পাতা সোজা হয়েছে | The page is straight |
| `flat.body` | এই সোজা পাতাটাই পড়া হবে। | This straightened page is what gets read. |
| `flat.fix` | কোণ ঠিক করুন | Fix corners |
| `flat.send` | পড়তে দিন | Read it |
| `read.1` | লেখা পড়ছি | Reading the writing |
| `read.2` | কোন লেখা কোন হিসাবের, ভাগ করছি | Sorting the writing into parts |
| `read.3` | হিসাব মেলাচ্ছি | Checking the sums |
| `read.note` | লেখা পড়ে AI, হিসাব মেলায় কোড, শেষ কথা আপনার। | AI reads, code does the sums, you have the final say. |
| `page` | পাতা {1} | Page {1} |
| `ov.title` | এই পাতায় {1}টা অংশ পেয়েছি | Scriba found {1} parts on this page |
| `ov.sub` | {1}টা প্রশ্ন, এক মিনিটের মতো লাগবে। | {1} questions, about a minute. |
| `ov.start` | দেখা শুরু করুন | Start checking |
| `ov.q` | {1}টা প্রশ্ন | Questions: {1} |
| `ov.nodate` | পাতায় তারিখ নেই | No date on the page |
| `supplier_visit` | কোম্পানি এসেছিল | Company visit |
| `day_sales` | দিনের বিক্রি | Day's sales |
| `visit.rep` | {1} এসেছিলেন | {1} came |
| `visit.before` | আগের দেনা | Owed before |
| `visit.paid` | আজ দিয়েছেন | Paid today |
| `visit.goods` | মাল এসেছে | Goods received |
| `visit.now` | এখন দেনা | Owed now |
| `visit.gap` | দাম ? | price ? |
| `visit.gapNow` | + মালের দাম | + the goods |
| `sales.lines` | {1}টা লাইন | {1} lines |
| `sales.total` | মোট বিক্রি | Total sales |
| `note` | নোট | Note |
| `prev` | আগের প্রশ্ন | Previous |
| `yes` | ঠিক আছে | That's right |
| `no` | না, বদলাব | No, change it |
| `say` | বলে দিন | Say it |
| `swipe` | ডানে সরালেও ঠিক হয় | Or swipe right |
| `other` | অন্য কিছু | Something else |
| `q.date` | পাতায় কোনো তারিখ লেখা নেই। আজকের তারিখ ধরব? | There's no date on this page. Shall I use today's? |
| `q.date.yes` | হ্যাঁ, আজ · {1} | Yes, today · {1} |
| `q.date.other` | অন্য দিন | Another day |
| `q.date.yday` | গতকাল · {1} | Yesterday · {1} |
| `q.visit` | {1} কোম্পানির {2} এসেছিলেন। আগে দেনা ছিল {3}, আজ তাঁকে দিয়েছেন {4}। ঠিক বুঝেছি? | {2} came from {1}. You owed {3} before, and paid {2} {4} today. Did I get that right? |
| `q.party` | ‘{1}’ কি আপনার খাতার ‘{2}’? | Is ‘{1}’ the ‘{2}’ in your khata? |
| `q.party.why` | খাতায় তাদের কাছে শেষ দেনা ছিল {1}। এই পাতার ‘আগের’ লেখাও {1}। | Your khata last showed {1} owed to them. This page's ‘before’ is also {1}. |
| `q.party.same` | হ্যাঁ, একই কোম্পানি | Yes, the same company |
| `q.party.new` | না, নতুন মহাজন | No, a new supplier |
| `q.price` | {1}টা মালের দাম লেখা নেই। দাম কত ছিল? | {1} goods have no price written. What did they cost? |
| `q.price.why` | কোম্পানির মেমো থাকলে দেখে বলুন। Scriba দাম আন্দাজ করবে না। | Check the company's memo if you have it. Scriba won't guess a price. |
| `q.price.save` | দাম রাখুন | Save the prices |
| `q.price.later` | পরে দেব | Later |
| `q.price.slot` | দাম দিন | Add price |
| `q.egg` | ডিমের টাকা দুইভাবে পড়া যায়। কোনটা লেখা? | The eggs' amount reads two ways. Which is written? |
| `q.egg.each` | {1}টা, {2} করে | {1} at {2} each |
| `q.cash` | এই {1}টা বিক্রি কি সব নগদে? | Were these {1} sales all cash? |
| `q.cash.why` | পাতায় নগদ বা বাকি লেখা নেই। | The page doesn't say cash or credit. |
| `q.cash.yes` | হ্যাঁ, সব নগদ | Yes, all cash |
| `q.cash.some` | কিছু বাকিতে | Some on credit |
| `rest.title` | বাকি {1}টা লাইন দেখে নিন | Check the other {1} lines |
| `rest.tap` | কোনোটা ভুল হলে সেটায় চাপুন | Tap any line that's wrong |
| `rest.ok` | সব ঠিক আছে | All correct |
| `bs.stamp` | মিলেছে | Checked |
| `bs.visit` | {1} হিসাব হয়ে গেছে | Done: {1} |
| `bs.sales` | দিনের বিক্রি মিলেছে | The day's sales are checked |
| `bs.gap` | মালের দাম এখনো বাকি। দাম দিলে দেনা পুরো হবে। | The goods still have no price. The amount owed is complete once you add it. |
| `bs.code` | হিসাব করেছে কোড, আপনার উত্তর থেকে | Worked out by code, from your answers |
| `bs.next` | পরের অংশ | Next part |
| `ps.title` | পুরো পাতা দেখা হয়েছে | The whole page is checked |
| `ps.confirm` | খাতায় তুলুন | Add to the khata |
| `ps.done` | খাতায় উঠেছে · আজকের হিসাবে যোগ হয়েছে | Added · it now counts in Today |
| `fix.which` | কোনটা ভুল? | What's wrong? |
| `fix.party` | কোম্পানি আর লোক | Company and person |
| `voice.listen` | শুনছি… দামটা বলুন | Listening… say the price |
| `voice.eg` | যেমন ‘আটশো চল্লিশ’ | For example ‘eight hundred forty’ |
| `voice.heard` | শুনেছি: ‘{1}’ | Heard: ‘{1}’ |
| `voice.never` | ‘রাখুন’ চাপলে তবেই বসবে। | Nothing is saved until you tap Keep. |
| `keep` | রাখুন | Keep |
| `del` | মুছুন | Delete |
