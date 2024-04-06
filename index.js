const puppeteer = require("puppeteer");
const fs = require("fs");

const LINKS_PATH = "data/links.json";
const CATEGORIES_PATH = "data/categories.json";

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

  fs.writeFileSync(LINKS_PATH, JSON.stringify(links, null, 2));

  browser.close();
}

async function getCategories() {
  console.log("Extracting categories...");
  const links = JSON.parse(fs.readFileSync(LINKS_PATH));
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  let cat_arr = [];

  for (let link of links) {
    console.log(`Getting categories for [ ${link.id} ]`);
    await page.goto(link.url);

    const categories = await page.evaluate(() => {
      const ctgr = Array.from(
        document.querySelectorAll("ul.categories li")
      ).filter((a) => !a.classList.contains("special-categories-label"));

      return ctgr.map((el) => {
        const a = el.querySelector("a");
        return { text: a.textContent.trim(), url: a.href };
      });
    });

    const category = {
      id: link.id,
      url: link.url,
      categories,
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

    if (lis.length === 0) {
      console.error("No table of content found");
      lis = Array.from(document.querySelectorAll(".mw-headline")).map(
        (elem) => "#" + elem.id
      );
    }

    lis = lis.filter(
      (elem) =>
        elem !== "#References" && elem !== "#Navigation" && elem !== "#Gallery"
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

async function getDescription(link) {
  console.log(`Getting description for [ ${link.id} ]`);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(link.url);

  const description = await page.evaluate(() => {
    let lis = "";
    let arr = Array.from(document.querySelectorAll(".portable-infobox"));
    let curr = null;

    if (arr.length !== 0) curr = arr[0].nextElementSibling;
    else {
      console.error("No portable-infobox found");
      arr = Array.from(document.querySelectorAll(".mw-parser-output > figure"));
    }

    if (arr.length === 0) {
      console.error("No figure found");
      arr = Array.from(document.querySelectorAll(".mw-parser-output"));
      curr = arr[0].firstElementChild;
    } else curr = arr[0].nextElementSibling;

    console.log("Found anchor: " + arr[0].nodeName);

    while (curr !== null) {
      if (curr.id === "toc" || curr.nodeName === "H2") break;
      if (curr.nodeName !== "#comment") lis += curr.textContent;
      curr = curr.nextSibling;
    }

    return lis.trim();
  });

  console.log(description);
  browser.close();
}

// getLinks();
getCategories();
// getTableOfContent({
//   id: "Occult Research Club",
//   url: "https://bakemonogatari.fandom.com/wiki/Occult_Research_Club",
// });
// getDescription({
//   id: "Arcs",
//   url: "https://bakemonogatari.fandom.com/wiki/Arcs",
// });

/************ Pages with different structure **************
https://bakemonogatari.fandom.com/wiki/Tsubasa_Hanekawa
  - complete layout
  -> OK

https://bakemonogatari.fandom.com/wiki/Namishiro_Park
  - figure instead of portable-infobox
  -> OK

https://bakemonogatari.fandom.com/wiki/Occult_Research_Club
  - no toc
  -> OK

https://bakemonogatari.fandom.com/wiki/Arcs
  - no portable-infobox
  - no figure
  -> OK
**********************************************************/
