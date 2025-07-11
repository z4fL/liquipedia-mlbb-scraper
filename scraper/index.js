import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { TOURNAMENTS } from "../config.js";
import fs from "fs";
import minimist from "minimist";

async function scrapeTournament(
  { name, url, region, stage },
  allGames,
  regionMatchCounters,
  browser // pass browser instance as argument
) {
  const page = await browser.newPage();
  console.log("Tournament: ", name, "\t\t | Stage: ", stage);

  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

  await page.waitForSelector(".brkts-match-has-details");

  const content = await page.content();
  const $ = cheerio.load(content);

  const matches = $(".brkts-match-has-details");

  matches.each((index, matchEl) => {
    if (regionMatchCounters[region] === undefined)
      regionMatchCounters[region] = 0;
    regionMatchCounters[region] += 1;
    const matchIndex = regionMatchCounters[region];

    const match = $(matchEl).find(".brkts-popup.brkts-match-info-popup");

    const meta = {
      matchIndex,
      tournament: name,
      stage: stage,
      region: region,
      date: match.find(".timer-object-date").text().trim(),
      left_team: match
        .find(".brkts-popup-header-opponent-left > div.block-team > span")
        .attr("data-highlightingclass"),
      right_team: match
        .find(".brkts-popup-header-opponent-right > div.block-team > span")
        .attr("data-highlightingclass"),
    };

    const matchHtml = match.html();
    if (matchHtml) {
      const games = matchDetail(matchHtml, meta);
      allGames.push(...games);
    }
  });

  await page.close();
}

function matchDetail(html, meta) {
  const $ = cheerio.load(html);
  const gameBlocks = $(".brkts-popup-body-game");
  const games = [];

  gameBlocks.each((i, block) => {
    const gameNum = i + 1;
    const game = {
      match_id: `${meta.tournament}_M${meta.matchIndex}_G${gameNum}`,
      tournament: meta.tournament,
      stage: meta.stage,
      region: meta.region,
      date: meta.date,
      game_number: gameNum,
      blue_team: "",
      red_team: "",
      blue_explaner: "",
      blue_jungler: "",
      blue_midlaner: "",
      blue_goldlaner: "",
      blue_roamer: "",
      red_explaner: "",
      red_jungler: "",
      red_midlaner: "",
      red_goldlaner: "",
      red_roamer: "",
      blue_bans: "",
      red_bans: "",
      winner: "",
      winner_team: "",
      game_duration: "",
    };

    const leftTeam = $(block).find(
      ".brkts-popup-body-element-thumbs:not(.brkts-popup-body-element-thumbs-right)"
    );
    const rightTeam = $(block).find(".brkts-popup-body-element-thumbs-right");

    const leftColor =
      leftTeam.find(".brkts-popup-side-color-blue").length > 0 ? "blue" : "red";
    const rightColor =
      rightTeam.find(".brkts-popup-side-color-red").length > 0 ? "red" : "blue";

    const teamSideMap = {
      left: leftColor,
      right: rightColor,
    };

    const teamMap = {
      blue: leftColor === "blue" ? leftTeam : rightTeam,
      red: rightColor === "red" ? rightTeam : leftTeam,
    };

    // assign team names with validation and fallback
    if (
      (leftColor === "blue" || leftColor === "red") &&
      (rightColor === "blue" || rightColor === "red")
    ) {
      game.blue_team = leftColor === "blue" ? meta.left_team : meta.right_team;
      game.red_team = rightColor === "red" ? meta.right_team : meta.left_team;
    } else {
      // fallback: assign as per DOM order if color detection fails
      game.blue_team = meta.left_team || "";
      game.red_team = meta.right_team || "";
    }

    // role order: EXP, Jungle, Mid, Gold, Roam
    const roles = ["explaner", "jungler", "midlaner", "goldlaner", "roamer"];

    for (const color of ["blue", "red"]) {
      const players = teamMap[color]
        .find("a[title]")
        .map((_, el) => $(el).attr("title"))
        .get();
      roles.forEach((role, idx) => {
        game[`${color}_${role}`] = players[idx] || "";
      });
    }

    // bans
    const bansTable = $(".brkts-popup-mapveto");
    const { blue_bans, red_bans } = extractBans($, bansTable, i, teamSideMap);
    game.blue_bans = blue_bans;
    game.red_bans = red_bans;

    // winner & duration
    const { winner, game_duration } = getWinnerAndDuration(
      $,
      block,
      teamSideMap
    );
    game.winner = winner;
    game.game_duration = game_duration;
    game.winner_team = winner == "blue" ? game.blue_team : game.red_team;

    games.push(game);
  });

  return games;
}

function getWinnerAndDuration($, gameBlock, teamSideMap) {
  const elements = $(gameBlock).children();

  // Cari index dari parent <div> yang punya icon fa-check (pemenang)
  const winnerIconParent = $(gameBlock)
    .find(".fa-check")
    .closest(".brkts-popup-spaced");
  const winnerIndex = elements.index(winnerIconParent);

  // Kalo posisi icon menang ada di kiri (< 3), maka tim kiri menang
  const isLeftWin = winnerIndex < 3;
  const winner = isLeftWin ? teamSideMap.left : teamSideMap.right;

  // Ambil durasi (posisi selalu di tengah, index ke-2)
  const duration = $(elements[2]).text().trim();

  return {
    winner,
    game_duration: duration,
  };
}

function extractBans($, bansTable, gameIndex, teamSideMap) {
  const rows = $(bansTable).find("table tbody tr");
  const targetRow = rows.eq(gameIndex + 1); // baris ke-2 = game 1 bans
  if (!targetRow.length) return { blue_bans: "", red_bans: "" };

  const leftBans = targetRow.find(
    ".brkts-popup-body-element-thumbs:not(.brkts-popup-body-element-thumbs-right) div a"
  );
  const rightBans = targetRow.find(
    ".brkts-popup-body-element-thumbs-right div a"
  );

  const getBanTitles = (elements) =>
    elements.map((i, el) => $(el).attr("title")).get();

  let blue_bans = [],
    red_bans = [];

  if (teamSideMap.left === "blue") {
    blue_bans = getBanTitles(leftBans);
    red_bans = getBanTitles(rightBans);
  } else {
    red_bans = getBanTitles(leftBans);
    blue_bans = getBanTitles(rightBans);
  }

  return {
    blue_bans: blue_bans.join(","),
    red_bans: red_bans.join(","),
  };
}

function toCSV(data) {
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const val = String(row[h] ?? "")
          .replace(/,/g, ";")
          .replace(/"/g, '""');
        return `"${val}"`;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

async function main() {
  const allGames = [];
  const regionMatchCounters = {};
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
  });
  try {
    for (const tournament of TOURNAMENTS) {
      await scrapeTournament(
        tournament,
        allGames,
        regionMatchCounters,
        browser
      );
    }
    if (allGames.length > 0) {
      const csv = toCSV(allGames);
      const dir = "./data";
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const fileName = `${dir}/M6.csv`;
      fs.writeFileSync(fileName, csv, "utf8");
      console.log(`Saved CSV to ${fileName}`);
    }
  } finally {
    await browser.close();
    console.log("Browser Close");
  }
}

async function mainByRegion() {
  const nameGames = {};
  const nameMatchCounters = {};
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
  });
  try {
    for (const tournament of TOURNAMENTS) {
      if (!nameGames[tournament.name]) nameGames[tournament.name] = [];
      await scrapeTournament(
        tournament,
        nameGames[tournament.name],
        nameMatchCounters,
        browser
      );
    }
    const dir = "./data";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const name in nameGames) {
      if (nameGames[name].length > 0) {
        const csv = toCSV(nameGames[name]);
        const fileName = `${dir}/${name}.csv`;
        fs.writeFileSync(fileName, csv, "utf8");
        console.log(`Saved CSV to ${fileName}`);
      }
    }
  } finally {
    await browser.close();
    console.log("Browser Close");
  }
}

const args = minimist(process.argv.slice(2));
const mode = args.region ? "tournamen" : "all";

console.log(`Scraping mode: ${mode}`);

// lanjutkan sesuai mode
if (mode === "all") {
  main().catch(console.error);
} else if (mode === "region") {
  mainByRegion().catch(console.error);
}
