# Liquipedia MLBB Scraper

A Node.js project to scrape Mobile Legends: Bang Bang match data from Liquipedia and save it as CSV.

## Project Structure

```
.
├── config.js
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── readme.md
├── data/
│   └── all_matches.csv
└── scraper/
    └── index.js
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Installation

Install dependencies:

```sh
pnpm install
```

### Usage

Run the scraper:

```sh
pnpm start
```

The scraped match data will be saved to `data/all_matches.csv`.

## Configuration

Edit `config.js` to adjust scraper settings.

## License

MIT
```