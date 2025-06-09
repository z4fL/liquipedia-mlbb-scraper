import puppeteer from "puppeteer";
import * as cheerio from "cheerio";
import { TOURNAMENTS } from "../config.js";
import fs from "fs";

async function scrapeTourmanent(
  { name, url, region, stage },
  allGames,
  regionMatchCounters
) {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
  });
  const page = await browser.newPage();

  console.log("Start goto...");
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  console.log("Page loaded.");

  await page.waitForSelector(".brkts-match-has-details");

  const content = await page.content();
  const $ = cheerio.load(content);

  const matches = $(".brkts-match-has-details");

  matches.each((index, matchEl) => {
    if (!regionMatchCounters[region]) regionMatchCounters[region] = 0;
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

    const games = matchDetail(match.html(), meta);
    allGames.push(...games);
  });

  await browser.close();
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

    // assign team names
    game.blue_team = leftColor === "blue" ? meta.left_team : meta.right_team;
    game.red_team = rightColor === "red" ? meta.right_team : meta.left_team;

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

    games.push(game);
  });

  return games;
}

function getWinnerAndDuration($, gameBlock, teamSideMap) {
  const isLeftWin =
    $(gameBlock)
      .find(".fa-check")
      .closest(".brkts-popup-body-element")
      .index() < 3;

  const winner = isLeftWin ? teamSideMap.left : teamSideMap.right;
  const duration = $(gameBlock)
    .find('[class*="brkts-popup-spaced"]')
    .text()
    .trim();

  return {
    winner: winner, // hasilnya: 'blue' atau 'red'
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
  for (const tournament of TOURNAMENTS) {
    await scrapeTourmanent(tournament, allGames, regionMatchCounters);
  }
  if (allGames.length > 0) {
    const csv = toCSV(allGames);
    const dir = "./data";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const fileName = `${dir}/all_matches.csv`;
    fs.writeFileSync(fileName, csv, "utf8");
    console.log(`Saved CSV to ${fileName}`);
  }
}

main().catch(console.error);
