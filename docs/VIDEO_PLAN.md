# Video plan (3:00, free)

The story is told with still images that are animated in the edit: slow zooms and pans, plus dissolves that age the same man in the same shot. Everything about the app is a real phone recording. Narration is in English. The app stays in Bangla, with one tap to English near the end.

Video material stays out of Git: images in `photos/`, and phone recordings, sound and renders in `video/` (`video/phone/`, `video/audio/`, `video/out/`). Both folders are in `.gitignore`, because this repo is public.

## Timeline

| Time | Picture | Narration |
|---|---|---|
| 0:00 | A1 young man in his new shop | "He opened his shop as a young man. Rice, lentils, oil, and a little credit for the neighbours he trusted." |
| 0:08 | A2 night, khata and calculator | "Every night, after the last customer, he sat down with his ledger and a calculator." |
| 0:17 | A3 **real** khata page: slow pan down A3-1, graded to night | "Sales. Credit. Payments to suppliers. All in his own hand, all in Bangla." |
| 0:23 | A4 hands in his hair | "And every night, something didn't add up." |
| 0:27 | A5 shutter down, he walks out | *(no words: khata thuds shut, shutter rattles down)* |
| 0:31 | A6 → A7 dissolve: the A4 close-up again, older each time | "Night after night. Year after year. He grew older. The shop never grew." |
| 0:39 | A8 buying a phone | "Then, one day, he bought his first smartphone." |
| 0:45 | A9 he looks down at his phone, then cut to R1 (what his screen shows) | "Now, at closing time, he opens Scriba and takes a photo of the page." |
| 0:50 | R1 scan | "Meta's Muse Wonder reads his handwriting, Bangla words and Bangla digits. It knows where each line sits on the page, and which figures it isn't sure of." |
| 1:02 | R2 numbers screen, with A12 beside it while he fixes a figure | "So Scriba shows him every number first, under his own writing, with the doubtful ones marked. He fixes a misread figure with one tap." |
| 1:15 | R2 a sum that doesn't come out | "Then code, not AI, does the arithmetic. If a written total doesn't match its lines, he sees where, and he decides." |
| 1:27 | R3 questions, ending on the page seal | "Only then does it ask what it can't know alone, like whose account a payment belongs to. Nothing goes into his books until he agrees." |
| 1:42 | R4 Today | "And this is what he never had. Today's sales, cash and credit apart. Money that went out. What should be in the drawer tonight." |
| 1:55 | R4 note and dues | "A plain note on what to watch. Everyone who owes him, and how much." *(match the words to what the recording shows)* |
| 2:03 | R4b Ask Scriba | "And when he wants to know something, he just asks." |
| 2:10 | R5 close the day | "At closing, he counts the drawer, and Scriba tells him whether it matches." |
| 2:18 | R6 switch to English | "No accounting words. Just his own money, in his own language. One tap, and it's in English." |
| 2:27 | A10 tea, smiling | "Nothing is scattered anymore. For the first time, he knows where his money goes." |
| 2:36 | A11 going home | "His evenings are his own again. And this time, the shop can grow with him." |
| 2:45 | Title card + link | "Scriba. AI reads. Code checks. He decides. For every small shop still running on a handwritten ledger." |

About 300 words, roughly 1,800 characters per take. The app lines are final only after the recordings: every claim has to match what is on screen.

## Images (you make these, free)

Use the **Gemini app** → *Create image*. If it lets you pick a model, use the Pro one for A1, A6 and A7, because it holds a face better. Save the files as `A1.png` … `A11.png`.

**How to get a consistent man:**
- **A1 is the master.** Every other image is made from it, directly or through another image. Retry A1 until you really like it, since 3–5 tries is normal.
- **For each edit, upload the image named in brackets fresh.** Don't keep editing the last result in a long chat, because small changes add up and the face drifts.
- He has fixed features that every prompt repeats: **a small mole on his left cheek**, a thin moustache, a light-blue shirt and a green-and-white checked lungi. They anchor his identity across ages.
- Prompts describe what to show, not what to avoid, because that works better with this model. Packaging print is kept out of focus, and the khata's writing is too small to read. The phone always faces away from us.

**Fixes for common problems:**
- Square image: *"Make this 16:9 landscape by extending the scene left and right. Change nothing else."*
- The face changed: *"Keep his face exactly as in the image I uploaded: same face shape, eyes, nose, moustache and the mole on his left cheek. Change only the [time/age/place]."*
- Readable or fake writing in focus: *"Make all writing on packets and signs soft and out of focus."*
- The phone screen shows: *"Turn the phone so its back faces the camera."*

### A1: young, opening day (new chat, no upload)

```
A photorealistic cinematic film still, 16:9 landscape.

A small grocery shop (mudir dokan) in a Bangladeshi market town, early morning, on its first day of business. Behind a worn wooden counter stands a slim Bangladeshi man of about 22: medium-brown skin, an oval face, short black hair parted on the left, a thin moustache and a small mole on his left cheek. He wears a light-blue short-sleeved shirt and a green-and-white checked lungi. He smiles quietly, full of hope, looking past the camera toward the street. His face is clearly visible in three-quarter view.

The shop is one open-fronted room with a rolled-up green metal shutter and a corrugated tin roof. Open jute sacks of rice and red lentils with tin scoops stand at the front. Plastic jars of biscuits and sweets with red lids line the counter. Tin shelves behind him hold bottles of mustard oil and bars of soap. Strips of shampoo sachets and a bunch of bananas hang on strings. A ceiling fan and a single fluorescent tube light are overhead. On the counter lie a long, red cloth-bound khata ledger, closed, and a small grey calculator. Everything is freshly painted and fully stocked. The shop front is plain, without a signboard.

Eye-level shot on a 35mm lens, medium-wide, the man slightly left of centre. Soft golden morning sunlight from the street. Shallow depth of field, so the packets in the background are soft and their print can't be read. Natural, documentary feel, rich but realistic colour.
```

### A2: young, night at the khata (upload A1)

```
Using this image, change the time to late night. Keep the same man, the same shop and the exact same camera position and framing.

The street outside is dark and empty. The only light is the cool-white fluorescent tube overhead, with deep shadows in the corners. The man now sits on a low stool behind the counter, bent over the red khata, which lies open in front of him. He holds a pen in his right hand and presses the calculator with his left. He looks tired, his brow furrowed. The open pages are full of dense handwriting, too small and soft to read.

Keep his face, hair, moustache, the mole on his left cheek, his light-blue shirt and checked lungi exactly the same. Photorealistic, 16:9.
```

### A3: real photo (you take it)

Your real khata page with a calculator and a pen on it, at night under one lamp, shot from above at a slight angle. AI can't write real Bangla, so this close-up has to be real.

### A4: stuck (upload A2)

```
Using this image, move the camera closer: a chest-up shot of the same man at the same counter at night, under the same fluorescent light, 50mm lens look.

He has given up. Both hands are buried in his hair, elbows on the counter, eyes squeezed shut, jaw tight. The open khata and the calculator are just visible at the bottom of the frame, soft and out of focus.

Keep his face, moustache, the mole on his left cheek and his light-blue shirt exactly the same. Photorealistic, 16:9.
```

### A5: walking out (upload A2)

```
Using this image, show the same shop from the dark street outside, late at night, from eye level about five metres away.

The same man, seen from behind, reaches up and pulls the green metal shutter halfway down. The fluorescent light inside spills out under the shutter onto the damp street. The street is empty and silent. A stray dog sleeps under a distant streetlight.

Keep his light-blue shirt and checked lungi the same. Photorealistic, 16:9, a lonely mood.
```

### A6: twenty years later (upload A4)

The same close-up as A4, so the aging dissolve shows him stuck in the same pose, year after year.

```
Using this image, keep everything exactly the same: camera position, framing, lighting, his pose, the open khata and the calculator. But it is twenty years later.

The man is now about 45: a little heavier, the first grey in his hair and moustache, faint lines around his eyes. He has the same face shape, eyes and nose, and the same mole on his left cheek. His light-blue shirt is faded. The shop has aged too: faded, chipped paint, a water stain on the wall, fewer goods on the shelves.

Photorealistic, 16:9.
```

### A7: forty years later (upload A6)

```
Using this image, keep everything exactly the same: camera position, framing, lighting, his pose with both hands in his hair, the open khata and the calculator. But it is fifteen years later.

He is now about 62: hair mostly grey and thinning, short grey stubble and a grey moustache, thin reading glasses, deeper lines on his face and hands. He has the same face shape and the same mole on his left cheek. The shop is shabbier still: peeling paint, a bigger water stain, rust on the shelves, almost nothing left on them, and the same old grey calculator with worn keys.

Photorealistic, 16:9.
```

### A8: buying a phone (upload A7)

```
Using this image, keep the same old man (same face, grey stubble, glasses, the mole on his left cheek, faded light-blue shirt and checked lungi) but move him to a small, brightly lit mobile phone shop in the same town, in the daytime.

There is a glass display counter, with plain, unbranded phone boxes stacked on shelves behind it, all in soft focus. A young shop assistant across the counter hands him a new smartphone. He holds it carefully in both hands, looking at it through his glasses with shy curiosity. The back of the phone faces the camera: a plain dark back with no logo.

Medium shot, eye level, 35mm lens. Photorealistic, 16:9.
```

### A9: photographing the khata (upload A2 and A7 together)

A7 is a close-up, so the wide view of the shop comes from A2.

```
Using these two images: take the shop, the camera position and the framing from the first image, and the old man from the second. It is now dusk: warm orange light from the street mixes with the tube light. The shop has aged as in the second image: peeling paint, a water stain, half-empty shelves.

He sits upright, calm and focused, holding a smartphone in both hands above the open red khata to photograph the page. The back of the phone faces the camera: a plain dark back with no logo. Its screen faces him.

Keep his face, glasses, stubble, the mole on his left cheek and his clothes exactly as in the second image. Photorealistic, 16:9.
```

### A10: content (upload A9)

```
Using this image, keep the same old man, shop and camera position. It is evening, with warm light.

The red khata is closed and the smartphone lies face-down on the counter beside it. He leans back holding a small glass of milky tea and smiles, relaxed and content, as if a weight has gone.

Keep his face, glasses, stubble, the mole on his left cheek and his clothes exactly the same. Photorealistic, 16:9.
```

### A11: going home (upload A5 and A10 together)

```
Using these two images: take the street view, the camera position and the shop front from the first image, and the old man from the second.

It is early evening. The sky is still deep blue, the streetlights are just coming on and a few people walk past. The old man pulls the green shutter down and turns his head toward the camera with a small, peaceful smile.

Keep his face, glasses, stubble, the mole on his left cheek and his clothes exactly as in the second image. Photorealistic, 16:9.
```

If the app takes only one image, upload A10 and start the prompt with *"Using this image, show the same old man from the street outside his shop"*.

### A12: checking the page against the phone (upload A9)

This one is shown beside the real screen recording while he fixes a figure. The screen itself is always the real recording.

```
Using this image, move the camera closer: a medium close-up from the chest up of the same old man at the same counter at dusk, in the same light, centred in the frame.

He is checking his khata against his phone. The phone is in his left hand, tilted toward him so its screen faces him and we can't see it; its back is plain and dark with no logo. The index finger of his right hand rests on a line of handwriting in the open red khata on the counter. He glances from the page to the phone, focused and careful, with the hint of a smile of someone who has just caught a mistake.

Keep his face, glasses, stubble, the mole on his left cheek and his clothes exactly the same. Photorealistic, 16:9.
```

## Phone recordings (you make these, free)

**Before recording:**
- Deploy F2 fix 3 (`cc6c328`) first, so the video shows the current app.
- Scan your real pages from a few different days first. Otherwise Today's week bars, dues and Scriba's note will be empty. Then record one fresh page.
- Turn on Do Not Disturb and charge the phone. Set the screen recorder to 1080p. Turn on **Show taps** (Developer options) so viewers see your taps.
- Move slowly and pause about 2 seconds on each screen. A long recording is easy to cut, but a rushed one can't be stretched.

| File | What to record |
|---|---|
| R1 | Open the app → camera → photograph the page → the reading |
| R2 | The numbers screen: scroll slowly, tap one marked figure and pick the right reading, settle one sum that doesn't come out, then "সব সংখ্যা ঠিক আছে" |
| R3 | Answer the questions and end on the page seal |
| R4 | Today: hold on the drawer, sales, money out, Scriba's note and the week bars. Then open dues and one customer |
| R4b | Ask Scriba: type a short question in Bangla about a customer on your pages (e.g. how much someone owes) and wait for the answer |
| R5 | Close the day: count the drawer, enter it, see whether it matches |
| R6 | Settings → English → back to Today in English |
| R7 (optional) | Someone films your hands photographing the khata with your phone, 5 seconds |

## Sound (free)

- **Narration:** ElevenLabs free plan, voice **Bill**, model Eleven v4, one file per line in `video/voice/bill/` (`video/tools/narrate.py`). Free-plan audio is for non-commercial use with credit, so the video description must say "Voice and sound effects generated by ElevenLabs". The app lines are generated after the phone recordings.
- **Sound effects:** generated with ElevenLabs into `video/audio/`: calculator, book thud, shutter, night street, morning street, camera click.
- **Music (you, from Pixabay, free):** the ElevenLabs music API needs a paid plan. Save into `video/audio/`:
  1. `music_story.mp3`: quiet, melancholic piano or sitar, at least 50 seconds (search "sad piano" or "emotional sitar")
  2. `music_hope.mp3`: warm, hopeful, gentle, at least 2 minutes (search "hopeful acoustic" or "inspiring piano")

## What Claude does

- Generates the narration with ElevenLabs.
- Adds motion to the stills (slow zoom and pan) and makes the aging dissolve.
- Lays out the app part in 16:9: the portrait phone recording in a phone frame on one side, and on the other side either A12 (while he fixes a figure) or a short English caption saying what's happening on screen.
- Cuts the phone recordings to the narration.
- Mixes the sound and burns in English captions.
- Shows a small "Story scenes: AI-generated" label during 0:00–0:45 and at 2:27–2:45.
- Exports a 1080p MP4 under 3:00, with ffmpeg on this machine.

**Optional, about $4:** animate A4 and A10 for real (5 s each) with Kling v3 on fal. That's $0.70 a try at the listed $0.14 per second, with a couple of tries each. Without it, they get zoom and pan like the other images.
