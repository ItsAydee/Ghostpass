# GhostPass — Your Free Personal Web Proxy

## Deploy to Vercel (100% Free)

### Step 1 — Put this on GitHub
1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository** → name it `myproxy` → click **Create repository**
3. Upload all these files to the repo (drag & drop works on GitHub)

### Step 2 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **Add New → Project**
3. Select your `myproxy` repo
4. Click **Deploy** — that's it!

### Step 3 — Use it
- Vercel gives you a free URL like `myproxy.vercel.app`
- Visit it from anywhere, on any device, even when your PC is off

---

## File Structure
```
myproxy/
├── api/
│   └── proxy.js       ← The backend that fetches pages
├── public/
│   └── index.html     ← The frontend UI
├── vercel.json        ← Vercel config
└── package.json
```

## Notes
- Works on Vercel's free plan with no credit card needed
- Supports HTML pages, images, CSS, and JS passthrough
- Some sites (Google, YouTube) block proxy access — that's normal
