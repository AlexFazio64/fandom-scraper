const fs = require("fs");
const puppeteer = require("puppeteer");
const { setTimeout } = require("timers/promises");

const url = "http://localhost:5173/";

(async () => {
  const browser = await puppeteer.launch();

  //maximize the window
  const pages = await browser.pages();
  const page = pages[0];
  await page.setViewport({ width: 1536, height: 738 });
  await page.goto(url);

  // wait for 1.5 seconds for the page to load
  await setTimeout(1500);

  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.press("KeyD");
  await page.keyboard.up("Control");
  await page.keyboard.up("Alt");

  // find the svg element and take a screenshot
  const svg = await page.$("#distribution");
  await svg.screenshot({ path: "./graphs/all.png" });
  console.log(`Saved all.png`);

  const categories = await page.$$("#categories > button");
  for (let btn of categories) {
    await btn.click();
    const title = await page.evaluate((btn) => btn.title, btn);
    await setTimeout(150);
    await svg.screenshot({ path: `./graphs/${title}.png` });
    console.log(`Saved ${title}.png`);
  }

  await browser.close();
})();
