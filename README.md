# CHYOADownloader
Python tool to convert CHYOA stories into an interactive html document

Download CHYOADownloader by cloning the git repository `git clone https://github.com/Wasmae/CHYOADownloader.git` or downloading the zip. To run the program, navigate to the CHYOADownloader directory and run main.py.


## Usage
Create a virtual environment, then install dependencies:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

```
usage: main.py [-h] [--link LINK] [--directory DIRECTORY]

optional arguments:
  -h, --help            show this help message and exit
  --link LINK           URL of CHYOA start
  --directory DIRECTORY, -d DIRECTORY
                        Directory to store downloaded files
```

### Sample Usage
`python main.py --link https://chyoa.com/story/Some-Story`

### Web UI

Start the local web interface (runs at `http://127.0.0.1:5050`):

```
python webapp.py
```

Paste one or more CHYOA URLs, set the output folder, and toggle image downloading—the same options as `--links`, `-d`, and `--no-images` on the CLI. Progress streams in the page while each story downloads.

### Game mode stories

Stories with CHYOA **Game mode** are detected automatically. The downloader calls `?game=start` on the story (same as clicking **Start Game** on the site) and reuses that session while crawling so branches and variable placeholders match the live reader more closely.

Exported HTML includes a small offline **game state** panel (`localStorage`) and substitutes `{game:...}` / `{reader:...}` placeholders in chapter text. Conditional branches that only appear after specific in-game actions may still be missing offline if they were hidden during the crawl — use CHYOA directly for a full stateful playthrough.

Disable with `--no-game-mode` or uncheck **Game mode support** in the web UI.

### Storyboard (bubble map)

A separate local UI visualizes an already-downloaded story folder as a draggable bubble graph:

```
python storyboard_webapp.py
```

Open **http://127.0.0.1:5051**, pick a folder that contains `index.html`, or choose one from the library list. Chapters are laid out in **horizontal depth lanes** (top → down) with branches grouped under their parents. The sidebar **outline** lists every chapter by layer. Forward choices are solid arrows with labels; optional dashed lines show “previous chapter” links.

Use **Export SVG** (1×–4× scale) to download the full map as one vector file—no WebP size cap. Open in a browser, Inkscape, or Illustrator.

#### GitHub Pages SVG viewer

The `docs/` folder is a static **pan/zoom viewer** for storyboard SVGs (mobile-friendly: drag, pinch, fit-to-screen). Enable GitHub Pages for this repo with source **Deploy from branch → `main` → `/docs`**, then open `https://<user>.github.io/CHYOADownloader/` and upload your exported `.svg`.
