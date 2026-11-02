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

The question rows (`q.*`) are in Part 4: U2b reconciled them with U2's questions engine, and the table there shows which D5 key each one replaced.

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

## Part 4: Scriba asks, as built (U2 + U2b, U4)

Source: the `q.*` section of `src/lib/i18n/messages/bn.ts` and `en.ts`, generated from the code in U2b. Change the strings there, not here. A question's sentence, its `why` line and each option's `detail` are rendered with `sentenceText`. `{1}` slots hold his words, money (৳, locale digits), counts or days.

### Where D5's keys went

| D5 (prototype) | Built as | Why it differs |
|---|---|---|
| `q.date`, `q.date.yes`, `q.date.yday`, `q.date.other` | `q.date` (`q.date.which` with no photo day), `q.date.photo`, `q.date.before`, `q.date.other` | Proposes the day the photo was taken, not today: a page may be photographed later. |
| `q.visit` | `q.meaning.visit.rep.figures` with `q.visit.both` (or `q.visit.before`, `q.visit.paid`); without a rep `q.meaning.visit.figures`; with no figures `q.meaning.visit.rep`, `q.meaning.visit` | The figures are what is written, several payments summed by code. “এবার” (this time) instead of “আজ” (today), because the visit isn't always today. |
| `q.party`, `q.party.same`, `q.party.new` | `q.same`, `q.same.yes.supplier`, `q.same.no.supplier` (and `.customer`) | The same question is asked for customers. Two or three possible matches: `q.same.which`, with the names as options. |
| `q.party.why` | `q.same.match.supplier` (the page's “before” equals the khata's due: `why.verified`, show the tick) or `q.same.due.supplier` (the due only); `.customer` too | Only with one match and a due above zero. |
| `q.price` | `q.delivery` (two or more goods from one company: one total), `q.prices` (heading of the grouped per-item card), `q.price` (one item) | The engine asks for the delivery's total first; “I'll price each one” opens the per-item slots. |
| `q.price.why`, `q.price.slot`, `q.price.save`, `q.price.later` | same keys | `q.price.why` is the `why` of `delivery` and `price` questions; `q.price.later` is their “later” option. |
| `q.egg` | `q.doubt.amount` (and `q.doubt.*` per field) | The line is quoted rather than the item named, and there's no “two ways”, because the model may give three readings. |
| `q.egg.each` | `q.per`, `q.per.unit` (an option's `detail`) | Worked out by code for each reading of an amount when the quantity reads as a number. |
| `q.cash`, `q.cash.why`, `q.cash.yes`, `q.cash.some` | `q.sales`, `q.sales.why`, `q.sales.cash`, `q.sales.each` | “Some on credit” goes line by line, through the line-kind cards. |

### All question strings

| Key | বাংলা | English |
|---|---|---|
| `q.yes` | হ্যাঁ, ঠিক | Yes, that's right |
| `q.later` | পরে বলব | Ask me later |
| `q.value` | {1} | {1} |
| `q.who.rep` | {1} ({2}) | {1} ({2}) |
| `q.meaning.visit.rep` | {2} কোম্পানির {1} এসেছিলেন। ঠিক বুঝেছি? | {1} came from {2}, a company you buy from. Did I get that right? |
| `q.meaning.visit` | {1} কোম্পানি থেকে লোক এসেছিল। ঠিক বুঝেছি? | Someone came from {1}, a company you buy from. Did I get that right? |
| `q.meaning.visit.rep.figures` | {2} কোম্পানির {1} এসেছিলেন। {3} ঠিক বুঝেছি? | {1} came from {2}. {3} Did I get that right? |
| `q.meaning.visit.figures` | {1} কোম্পানি থেকে লোক এসেছিল। {2} ঠিক বুঝেছি? | Someone came from {1}. {2} Did I get that right? |
| `q.visit.both` | আগে দেনা ছিল {1}, এবার দিয়েছেন {2}। | You owed {1} before, and paid {2} this time. |
| `q.visit.before` | আগে দেনা ছিল {1}। | You owed {1} before. |
| `q.visit.paid` | এবার দিয়েছেন {1}। | You paid {1} this time. |
| `q.meaning.supplier` | এটা মহাজন {1}-এর সাথে আপনার হিসাব। ঠিক বুঝেছি? | This is your account with {1}, a supplier. Did I get that right? |
| `q.meaning.customer` | এটা {1}-এর বাকির হিসাব। ঠিক বুঝেছি? | This is {1}'s account, a customer who buys on credit. Did I get that right? |
| `q.meaning.who` | পাতার এই অংশটা কার হিসাব? নামটা বলুন। | Whose account is this part of the page? Say the name. |
| `q.meaning.other` | পাতার এই অংশটা কিসের হিসাব? | What is this part of the page? |
| `q.kind.day_sales` | দিনের বিক্রি | The day's sales |
| `q.kind.customer_account` | কাস্টমারের বাকির হিসাব | A customer's account |
| `q.kind.supplier_visit` | কোম্পানির লোক এসেছিল | A company rep's visit |
| `q.kind.supplier_account` | মহাজনের হিসাব | A supplier's account |
| `q.kind.expenses` | দোকানের খরচ | Shop expenses |
| `q.kind.other` | অন্য কিছু | Something else |
| `q.same` | “{1}” কি আপনার খাতার “{2}”? | Is “{1}” the “{2}” in your khata? |
| `q.same.which` | “{1}” কি খাতার আগের কেউ? | Is “{1}” someone already in your khata? |
| `q.same.yes.supplier` | হ্যাঁ, একই কোম্পানি | Yes, the same company |
| `q.same.yes.customer` | হ্যাঁ, একই লোক | Yes, the same person |
| `q.same.no.supplier` | না, নতুন মহাজন | No, a new supplier |
| `q.same.no.customer` | না, নতুন কাস্টমার | No, a new customer |
| `q.same.due.supplier` | খাতায় তাদের কাছে শেষ দেনা ছিল {1}। | Your khata last showed {1} owed to them. |
| `q.same.match.supplier` | খাতায় তাদের কাছে শেষ দেনা ছিল {1}। এই পাতার “আগের” লেখাও {1}। | Your khata last showed {1} owed to them. This page's “before” is also {1}. |
| `q.same.due.customer` | খাতায় তাদের শেষ বাকি ছিল {1}। | Your khata last showed them owing you {1}. |
| `q.same.match.customer` | খাতায় তাদের শেষ বাকি ছিল {1}। এই পাতার “আগের” লেখাও {1}। | Your khata last showed them owing you {1}. This page's “before” is also {1}. |
| `q.sales` | এই {1}টা বিক্রি কি সব নগদে? | Were these {1} sales all cash? |
| `q.sales.cash` | হ্যাঁ, সব নগদ | Yes, all cash |
| `q.sales.credit` | সব বাকিতে | All on credit |
| `q.sales.each` | কিছু বাকিতে | Some on credit |
| `q.sales.why` | পাতায় নগদ বা বাকি লেখা নেই। | The page doesn't say cash or credit. |
| `q.expenses` | এই {1}টা লাইন কি সব দোকানের খরচ? | Are these {1} lines all shop expenses? |
| `q.expenses.yes` | হ্যাঁ, সব খরচ | Yes, all expenses |
| `q.each` | একটা একটা করে দেখি | Let me go line by line |
| `q.direction` | “{1}” — এই লাইনটা কী? | “{1}”: what is this line? |
| `q.direction.check` | “{1}” — {2}, ঠিক? | “{1}”: {2}. Right? |
| `q.say.opening.supplier` | আগে {1}-এর কাছে {2} দেনা ছিল | you owed {1} {2} before |
| `q.say.closing.supplier` | এখন {1}-এর কাছে {2} দেনা | you now owe {1} {2} |
| `q.say.opening.customer` | {1}-এর আগের বাকি {2} | {1} owed you {2} before |
| `q.say.closing.customer` | {1}-এর এখন বাকি {2} | {1} now owes you {2} |
| `q.say.supplier_payment` | {1}-কে {2} দিয়েছেন | you paid {1} {2} |
| `q.say.credit_purchase` | {1}-এর কাছ থেকে {2}-এর মাল বাকিতে নিয়েছেন | you took goods worth {2} on credit from {1} |
| `q.say.credit_sale` | {1} {2}-এর মাল বাকিতে নিয়েছেন | {1} took goods worth {2} on credit |
| `q.say.repayment` | {1} {2} জমা দিয়েছেন | {1} paid back {2} |
| `q.say.cash_sale` | {2} নগদ বিক্রি | a cash sale of {2} |
| `q.say.purchase` | {2}-এর মাল নগদে কিনেছেন | stock bought for {2} in cash |
| `q.say.expense` | {2} খরচ | a shop expense of {2} |
| `q.doubt.amount` | “{1}” — টাকার অঙ্কটা কোনটা লেখা? | “{1}”: which amount is written? |
| `q.doubt.balance` | “{1}” — বাকি কত লেখা? | “{1}”: which due is written? |
| `q.doubt.qty` | “{1}” — পরিমাণ কত লেখা? | “{1}”: which quantity is written? |
| `q.doubt.rate` | “{1}” — দর কত লেখা? | “{1}”: which rate is written? |
| `q.doubt.customer` | “{1}” — নামটা কী লেখা? | “{1}”: which name is written? |
| `q.doubt.item` | “{1}” — কোন জিনিস লেখা? | “{1}”: which item is written? |
| `q.doubt.unit` | “{1}” — একক কী লেখা? | “{1}”: which unit is written? |
| `q.check` | “{1}” — {2} পড়েছি, ঠিক? | “{1}”: I read {2}. Right? |
| `q.unreadable` | “{1}” — {2} সংখ্যা হিসেবে পড়া যাচ্ছে না। কত লেখা? | “{1}”: the {2} can't be read as a number. What is written? |
| `q.mixed` | “{1}” — {2}-এ বাংলা আর ইংরেজি অঙ্ক মেশানো: {3}। ঠিক পড়েছি? | “{1}”: the {2} mixes Bangla and English digits: {3}. Did I read it right? |
| `q.field.amount` | টাকার অঙ্ক | amount |
| `q.field.balance` | বাকি | due |
| `q.field.qty` | পরিমাণ | quantity |
| `q.field.rate` | দর | rate |
| `q.per` | {1}টা, {2} করে | {1} at {2} each |
| `q.per.unit` | {1} {2}, প্রতি {2} {3} | {1} {2} at {3} per {2} |
| `q.price` | “{1}” — দাম লেখা নেই। কত ছিল? | “{1}”: no price is written. What did it cost? |
| `q.prices` | {1}টা মালের দাম লেখা নেই। দাম কত ছিল? | {1} goods have no price written. What did they cost? |
| `q.price.why` | কোম্পানির মেমো থাকলে দেখে বলুন। Scriba দাম আন্দাজ করবে না। | Check the company's memo if you have it. Scriba won't guess a price. |
| `q.price.slot` | দাম দিন | Add price |
| `q.price.save` | দাম রাখুন | Save the prices |
| `q.price.later` | পরে দেব | Later |
| `q.delivery` | {1} {2}টা মাল দিয়ে গেছেন, দাম লেখা নেই। সব মিলিয়ে কত ছিল? | {1} left {2} goods with no price written. What did they cost in all? |
| `q.delivery.each` | আলাদা আলাদা দাম বলব | I'll price each one |
| `q.opening.supplier` | এর আগে {1}-এর কাছে কোনো দেনা ছিল? | Did you owe {1} anything before this? |
| `q.opening.customer` | এর আগে {1}-এর কোনো বাকি ছিল? | Did {1} owe you anything before this? |
| `q.opening.none` | না, কিছু ছিল না | No, nothing |
| `q.off.balance` | হিসাব মিলছে না: লাইনগুলো থেকে হয় {1}, কিন্তু লেখা আছে {2}। | It doesn't add up: the lines give {1}, but {2} is written. |
| `q.off.total` | যোগ করলে হয় {1}, কিন্তু মোট লেখা {2}। | The lines add up to {1}, but the total says {2}. |
| `q.off.qty` | গুণ করলে হয় {1}, কিন্তু লেখা আছে {2}। | Multiplied out it's {1}, but {2} is written. |
| `q.off.use` | {1} ধরুন | Use {1} |
| `q.off.keep` | লেখা এরকমই, রেখে দিন | It's written that way, keep it |
| `q.off.look` | লাইনগুলো দেখি | Show me the lines |
| `q.date` | পাতায় কোনো তারিখ লেখা নেই। ছবি তোলার দিনটাই ধরব? | There's no date on this page. Shall I use the day the photo was taken? |
| `q.date.which` | পাতায় কোনো তারিখ লেখা নেই। এটা কোন দিনের পাতা? | There's no date on this page. Which day is it from? |
| `q.date.photo` | হ্যাঁ, ছবির দিন · {1} | Yes, the photo's day · {1} |
| `q.date.before` | আগের দিন · {1} | The day before · {1} |
| `q.date.other` | অন্য দিন | Another day |

### U4: the company memo, as built

The memo questions (`memo`, `memo_extra`, `memo_differs`) and the memo forms of `delivery` and `price`, generated from the code in U4. The memo card itself (the memo photo inside the price card) is designed and built in U4's UI half, after B7.

| Key | বাংলা | English |
|---|---|---|
| `q.memo.link` | “{1}”-এর এই মেমোটা কি {2}-এর রেখে যাওয়া? | Is this memo from “{1}” the one {2} left? |
| `q.memo.link.unnamed` | এই মেমোটা কি {1}-এর রেখে যাওয়া? | Is this memo the one {1} left? |
| `q.memo.link.which` | এই মেমোটা কার? | Whose visit is this memo from? |
| `q.memo.link.why` | মেমোর কোম্পানি “{1}”-এর নাম পাতায় নেই। | The memo's company, “{1}”, isn't named on your page. |
| `q.memo.link.why.several` | পাতার একাধিক হিসাব “{1}” হতে পারে। | More than one visit on your page could be “{1}”. |
| `q.memo.link.why.unnamed` | মেমোতে কোম্পানির নাম পড়া গেল না। | Scriba couldn't read a company's name on the memo. |
| `q.memo.link.yes` | হ্যাঁ, ওনাদেরই | Yes, it's theirs |
| `q.memo.link.no` | না, অন্য কারও | No, it's from someone else |
| `q.memo.delivery` | {1}-এর মেমোতে {2}টা মালের দাম সব মিলিয়ে {3}। মেমোর দামগুলোই ধরব? | {1}'s memo prices the {2} goods at {3} in all. Use the memo's prices? |
| `q.memo.delivery.use` | হ্যাঁ, মেমোর দাম ধরুন | Yes, use the memo's prices |
| `q.memo.delivery.total` | {1}-এর মেমোতে এই {3}টা মালের দাম {4} ছাড় দিয়ে {2}। সব মিলিয়ে {2} ধরব? | {1}'s memo comes to {2} for these {3} goods, after {4} off. Use {2} for them? |
| `q.memo.total.use` | হ্যাঁ, সব মিলিয়ে {1} | Yes, {1} in all |
| `q.memo.price` | “{1}” — মেমোতে দাম {2}। এটাই ধরব? | “{1}”: the memo prices it at {2}. Use that? |
| `q.memo.use` | হ্যাঁ, মেমোর {1} | Yes, {1} from the memo |
| `q.memo.line` | “{1}” · {2} | “{1}” · {2} |
| `q.memo.from` | মেমো থেকে: “{1}”। | From the memo: “{1}”. |
| `q.memo.sums` | মেমোর লাইনগুলো যোগ করলে মোটের সাথে মেলে। | The memo's lines add up to its total. |
| `q.memo.due` | এই দামে তাদের কাছে দেনা হয় {1}, মেমোর বাকির সাথে মেলে। | With these prices you owe them {1}, the same due as on the memo. |
| `q.memo.nototal` | মেমোর লাইনগুলো মোটের সাথে মিলিয়ে দেখা যায়নি। | Scriba couldn't check the memo's lines against its total. |
| `q.memo.sums.off` | মেমোর লাইন যোগ করলে হয় {1}, কিন্তু মোট লেখা {2}। | The memo's lines add up to {1}, but its total says {2}. |
| `q.memo.discount` | মেমোতে মোট থেকে {1} ছাড় আছে, তাই লাইনের দাম আর আপনার দেনা এক নয়। | The memo takes {1} off its total, so its line prices aren't what you owe. |
| `q.memo.partial` | মেমোতে এদের {1}টার দাম আছে। আলাদা আলাদা দাম বললে মেমোর দাম দেখাব। | The memo has prices for {1} of them. Price each one to use them. |
| `q.memo.none` | এই মালগুলোর কোনোটাই মেমোতে পাইনি। | None of these goods is on the memo. |
| `q.memo.maybe` | মেমোর এই লাইনগুলোর একটা হতে পারে। একটা বেছে নিন, বা দাম বলুন। | One of these memo lines may be it. Pick one, or say the price. |
| `q.memo.unsure` | মেমোতে দামটা মিলিয়ে দেখুন: Scriba নিশ্চিত হতে পারেনি। | Check this price on the memo: Scriba couldn't confirm it. |
| `q.memo.extra` | মেমোতে “{1}”-ও আছে, দাম {2}। পাতায় এটা লেখা নেই। হিসাবে যোগ করব? | The memo also lists “{1}” for {2}. It isn't on your page. Add it to the visit? |
| `q.memo.extras` | মেমোতে আরও {1}টা মাল আছে যা পাতায় লেখা নেই, সব মিলিয়ে {2}। হিসাবে যোগ করব? | The memo lists {1} more goods that aren't on your page, {2} in all. Add them to the visit? |
| `q.memo.extra.why` | এই চালানের সাথে এসে থাকলেই যোগ করুন। | Add them only if they came with this delivery. |
| `q.memo.extra.add` | যোগ করুন | Add it |
| `q.memo.extra.skip` | বাদ দিন | Leave it out |
| `q.memo.extras.add` | সবগুলো যোগ করুন | Add them all |
| `q.memo.extras.skip` | সবগুলো বাদ দিন | Leave them out |
| `q.memo.differs` | “{1}” — পাতায় {2}, মেমোতে {3}। কোনটা ঠিক? | “{1}”: the page says {2}, the memo says {3}. Which is right? |
| `q.memo.differs.before` | পাতায় আগের দেনা {1}, মেমোতে {2}। কোনটা ঠিক? | Your page says you owed {1} before; the memo says {2}. Which is right? |
| `q.memo.differs.paid` | পাতায় দিয়েছেন {1}, মেমোতে জমা {2}। কোনটা ঠিক? | Your page says you paid {1}; the memo says {2}. Which is right? |
| `q.memo.page` | পাতার {1} | {1}, as on the page |
| `q.memo.memo` | মেমোর {1} | {1}, as on the memo |
| `q.memo.same.both` | মেমোতেও একই: আগের দেনা {1}, জমা {2}। | The memo shows the same: {1} before and {2} paid. |
| `q.memo.same.before` | মেমোতেও আগের দেনা {1}। | The memo also shows {1} owed before. |
| `q.memo.same.paid` | মেমোতেও জমা {1}। | The memo also shows {1} paid. |

### The page's company memos (U4 UI, details screen)

| Key | বাংলা | English |
|---|---|---|
| `dt.memo.title` | কোম্পানির মেমো | Company memos |
| `dt.memo.sub` | মালের সাথে আসা চালান বা ক্যাশ মেমো। Scriba একবার পড়ে, প্রশ্নে এর দাম কাজে লাগায়। | The challan or cash memo that came with the goods. Scriba reads it once and uses its prices in its questions. |
| `dt.memo.add` | কোম্পানির মেমো যোগ করুন | Add the company memo |
| `dt.memo.sending` | মেমো পাঠানো হচ্ছে… | Sending the memo… |
| `dt.memo.reading` | মেমো পড়া হচ্ছে… | Reading the memo… |
| `dt.memo.unread` | এখনো পড়া হয়নি | Not read yet |
| `dt.memo.failed` | পড়া যায়নি | Couldn't read it |
| `dt.memo.company` | কোম্পানির মেমো | Company memo |
| `dt.memo.total` | মোট {1} | Total {1} |
| `dt.memo.noTotal` | মোট পড়া যায়নি | No total read |
| `dt.memo.read` | পড়ুন | Read it |
| `dt.memo.again` | আবার পড়ুন | Read again |
| `dt.memo.max` | একটা পাতায় {1}টার বেশি মেমো রাখা যায় না। | A page can have at most {1} memos. |
| `dt.memo.err.file` | ছবিটা খোলা যাচ্ছে না। অন্য একটা ছবি দিন। | That photo can't be opened. Try another one. |
| `dt.memo.err.taken` | এই ছবিটা আগেই Scriba-তে আছে। | This photo is already in Scriba. |
| `dt.memo.err.send` | মেমোটা পাঠানো যায়নি। আবার চেষ্টা করুন। | The memo couldn't be sent. Try again. |
| `dt.memo.err.read` | মেমোটা পড়া যায়নি। পরে আবার চেষ্টা করুন। | The memo couldn't be read. Try again later. |

## Part 5: the ask deck, as built (B7)

Source: the `asks.*` section of `src/lib/i18n/messages/bn.ts` and `en.ts` (B7 parts 1 and 2, 2 Nov). Change the strings there, not here. They are Part 3's overview, visit card, quick confirm, stamp, page seal and voice strings, with three changes: “এবার দিয়েছেন / Paid this time” (U2b's reason: the visit isn't always today); `asks.bs.party` names the party with a colon, because a Bangla possessive (প্রাণের, ফ্রেশের) depends on the word's ending; and customer-account rows (`asks.cust.*`). New, written in B7 and not yet read by a Bangla reader: `asks.ov.title1`, `asks.ov.none`, `asks.ov.page`, `asks.back`, `asks.cust.*`, `asks.total.expenses`, `asks.total`, `asks.type`, `asks.which`, `asks.rest.all`, `asks.line.title`, `asks.bs.part`, `asks.bs.later`, `asks.bs.end`, `asks.ps.open`, `asks.ps.later`, `asks.voice.listen`, `asks.voice.none`, `asks.err.*`; and from part 2, `asks.rest.one`, `asks.rest.allOne` (one line left: English needs a singular) and `asks.in.party`, `asks.in.date` (the label over a typed name or day).

| Key | বাংলা | English |
|---|---|---|
| `asks.kicker` | Scriba জানতে চায় | Scriba asks |
| `asks.ov.title` | এই পাতায় {1}টা অংশ পেয়েছি | Scriba found {1} parts on this page |
| `asks.ov.title1` | এই পাতায় একটা অংশ পেয়েছি | Scriba found one part on this page |
| `asks.ov.sub` | {1}টা প্রশ্ন, এক মিনিটের মতো লাগবে। | {1} questions, about a minute. |
| `asks.ov.none` | জিজ্ঞেস করার কিছু নেই। লাইনগুলো দেখে খাতায় তুলুন। | Nothing to ask. Look over the lines and add them to the khata. |
| `asks.ov.start` | দেখা শুরু করুন | Start checking |
| `asks.ov.q` | {1}টা প্রশ্ন | Questions: {1} |
| `asks.ov.page` | পুরো পাতা | The whole page |
| `asks.ov.nodate` | পাতায় তারিখ নেই | No date on the page |
| `asks.back` | অংশগুলোয় ফিরুন | Back to the parts |
| `asks.visit.rep` | {1} এসেছিলেন | {1} came |
| `asks.visit.before` | আগের দেনা | Owed before |
| `asks.visit.paid` | এবার দিয়েছেন | Paid this time |
| `asks.visit.goods` | মাল এসেছে | Goods received |
| `asks.visit.now` | এখন দেনা | Owed now |
| `asks.cust.before` | আগের বাকি | Owed you before |
| `asks.cust.paid` | জমা দিয়েছেন | Paid back |
| `asks.cust.goods` | বাকিতে নিয়েছেন | Took on credit |
| `asks.cust.now` | এখন বাকি | Owes you now |
| `asks.gap` | দাম ? | price ? |
| `asks.gapNow` | + মালের দাম | + the goods |
| `asks.lines` | {1}টা লাইন | {1} lines |
| `asks.total.sales` | মোট বিক্রি | Total sales |
| `asks.total.expenses` | মোট খরচ | Total spent |
| `asks.total` | মোট | Total |
| `asks.yes` | ঠিক আছে | That's right |
| `asks.no` | না, বদলাব | No, change it |
| `asks.say` | বলে দিন | Say it |
| `asks.type` | লিখে দিন | Type it |
| `asks.swipe` | ডানে সরালেও ঠিক হয় | Or swipe right |
| `asks.which` | কোনটা ঠিক? | Which is right? |
| `asks.rest.title` | বাকি {1}টা লাইন দেখে নিন | Check the other {1} lines |
| `asks.rest.all` | এই অংশের {1}টা লাইন দেখে নিন | Check the {1} lines of this part |
| `asks.rest.one` | বাকি লাইনটা দেখে নিন | Check the other line |
| `asks.rest.allOne` | এই অংশের লাইনটা দেখে নিন | Check this part's line |
| `asks.rest.tap` | কোনোটা ভুল হলে সেটায় চাপুন | Tap any line that's wrong |
| `asks.rest.ok` | সব ঠিক আছে | All correct |
| `asks.line.title` | এই লাইনটা একবার দেখুন | Have a look at this line |
| `asks.stamp` | মিলেছে | Checked |
| `asks.bs.party` | {1}: হিসাব হয়ে গেছে | {1}: done |
| `asks.bs.sales` | দিনের বিক্রি মিলেছে | The day's sales are checked |
| `asks.bs.part` | এই অংশের হিসাব হয়ে গেছে | This part is done |
| `asks.bs.gap` | মালের দাম এখনো বাকি। দাম দিলে দেনা পুরো হবে। | The goods still have no price. The amount owed is complete once you add it. |
| `asks.bs.later` | এই অংশের {1}টা প্রশ্ন পরে দেবেন বলেছেন। | You left {1} questions on this part for later. |
| `asks.bs.code` | হিসাব করেছে কোড, আপনার উত্তর থেকে | Worked out by code, from your answers |
| `asks.bs.next` | পরের অংশ | Next part |
| `asks.bs.end` | পুরো পাতা দেখুন | See the whole page |
| `asks.ps.title` | পুরো পাতা দেখা হয়েছে | The whole page is checked |
| `asks.ps.open` | {1}টা প্রশ্ন পরে দেবেন বলেছেন। সেগুলোর লাইন এখন খাতায় উঠবে না। | You left {1} questions for later. Their lines won't go into the khata yet. |
| `asks.ps.later` | এখন উত্তর দিন | Answer them now |
| `asks.ps.confirm` | খাতায় তুলুন | Add to the khata |
| `asks.ps.done` | খাতায় উঠেছে · আজকের হিসাবে যোগ হয়েছে | Added · it now counts in Today |
| `asks.voice.listen` | শুনছি… বলুন | Listening… say it |
| `asks.voice.price` | শুনছি… দামটা বলুন | Listening… say the price |
| `asks.voice.eg` | যেমন ‘আটশো চল্লিশ’ | For example ‘eight hundred forty’ |
| `asks.voice.heard` | শুনেছি: ‘{1}’ | Heard: ‘{1}’ |
| `asks.voice.never` | ‘রাখুন’ চাপলে তবেই বসবে। | Nothing is saved until you tap Keep. |
| `asks.voice.none` | বোঝা যায়নি। আবার বলুন বা লিখে দিন। | I couldn't make that out. Say it again or type it. |
| `asks.keep` | রাখুন | Keep |
| `asks.in.party` | অথবা নামটা লিখুন | Or type the name |
| `asks.in.date` | অথবা দিনটা লিখুন, যেমন ২/১১/২০২৬ | Or type the day, like 2/11/2026 |
| `asks.err.stale` | এই প্রশ্নটা এর মধ্যে বদলে গেছে। আবার খুলুন। | This question has changed. Reload to see it again. |
| `asks.err.bad` | এটা এখানে বসানো যায় না। আবার দেখুন। | That can't be used here. Have another look. |
