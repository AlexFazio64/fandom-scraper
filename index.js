const puppeteer = require("puppeteer");
const fs = require("fs");

const LINKS_PATH = "data/links.json";
const CATEGORIES_PATH = "data/categories.json";
// const CONTENT_PATH = "data/content.json";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLinks() {
  console.log("Getting links...");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://bakemonogatari.fandom.com/wiki/Local_Sitemap");

  let links = await page.evaluate(() => {
    const anchors = Array.from(
      document.querySelectorAll(".mw-allpages-chunk li a")
    );
    return anchors.map((anchor) => ({
      id: anchor.textContent.trim(),
      url: anchor.href,
    }));
  });

  fs.writeFileSync(path, JSON.stringify(LINKS_PATH, null, 2));

  browser.close();
}

async function getCategories() {
  console.log("Extracting categories...");
  const links = JSON.parse(fs.readFileSync(LINKS_PATH));
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  let cat_arr = [];
  let count = 0;
  let chunk = links.length / 10;

  for (let link of links) {
    count++;
    if (count % chunk === 0) {
      console.log(`Progress: ${count} / ${links.length}`);
      console.log("Sleeping for 1 seconds...");
      sleep(1000);
    }

    console.log(`Getting categories for [ ${link.id} ]`);

    await page.goto(link.url);
    const category = {
      id: link.id,
      url: link.url,
      categories: await page.evaluate(() => {
        const categories = Array.from(
          document.querySelectorAll(".page-header__categories a")
        );

        return categories.map((category) => ({
          text: category.textContent.trim(),
          url: category.href,
        }));
      }),
    };

    cat_arr = [...cat_arr, category];
  }

  fs.writeFileSync(CATEGORIES_PATH, JSON.stringify(cat_arr, null, 2));
  browser.close();
}

async function getTableOfContent(link) {
  console.log(`Getting content for [ ${link.id} ]`);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(link.url);

  const toc = await page.evaluate(() => {
    let lis = [];
    Array.from(document.querySelectorAll("#toc ul li.toclevel-1")).forEach(
      (top) => {
        let a = Array.from(top.querySelectorAll("a"));
        if (a.length > 1) {
          let main = a[0].hash;
          let subs = Array.from(top.querySelectorAll("ul li a")).map(
            (sub) => sub.hash
          );
          lis.push({ [main]: subs.splice(1) });
        } else lis.push(top.querySelector("a").hash);
      }
    );
    return lis;
  });

  const content = {
    id: link.id,
    url: link.url,
    toc,
  };

  const path = `content/${link.id.replace(/[<>:"/\\|?*]/g, "_")}`;
  if (!fs.existsSync(path)) fs.mkdirSync(path, { recursive: true });

  fs.writeFileSync(`${path}/map.json`, JSON.stringify(content, null, 2));
  browser.close();
}

// getLinks();
// getCategories();
getTableOfContent({
  id: "Tsubasa Hanekawa",
  url: "https://bakemonogatari.fandom.com/wiki/Tsubasa_Hanekawa#Catchphrases_/_Running_Gags:~:text=%22I%20don%27t%20know%20everything%2C%20I%20only%20know%20what%20I%20know.%22",
});
