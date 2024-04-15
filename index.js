const fs = require("fs");
const puppeteer = require("puppeteer");

const logStream = fs.createWriteStream("log.txt", { flags: "a" });

const LINKS_PATH = "data/links.json";
const CATEGORIES_PATH = "data/categories.json";
const CONTENT_DIR = "content/";

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

    const excludedElements = ["#References", "#Navigation", "#Gallery"];
    lis = lis.filter((elem) => !excludedElements.includes(elem));

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

async function getDescription(page, link) {
  console.log(`Getting description for [ ${link.id} ]`);
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

  return description;
}

async function readMap(path) {
  let map = JSON.parse(fs.readFileSync(path + "/map.json"));

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(map.url);

  map["Description"] = await getDescription(page, map);

  for (let sec of map.toc) {
    if (typeof sec === "string") {
      console.log(sec);
      const content = await page.evaluate(getContentFromHeader(), sec);
      map[sec] = content;

      console.log(map[sec]);
      continue;
    } else {
      if (Object.keys(sec)[0] === "#Appears_In") {
        console.log("#Appears_In");
        const content = await page.evaluate(getAppearances());
        map["#Appears_In"] = content;
        console.log(map["#Appears_In"]);
      } else {
        for (let sub of sec[Object.keys(sec)[0]]) {
          console.log(sub);
          const content = await page.evaluate(getContentFromHeader(), sub);
          map[sub] = content;
          console.log(map[sub]);
        }
      }
    }
  }

  fs.writeFileSync(path + "/content.json", JSON.stringify(map, null, 2));
  browser.close();

  function getAppearances() {
    return () => {
      let list = document.getElementById("Appears_In").parentElement;
      list = list.nextElementSibling;
      let link = [];

      while (list.nodeName !== "H2") {
        while (list.nodeName !== "UL") list = list.nextElementSibling;
        let lis = Array.from(list.querySelectorAll("li"));
        for (let li of lis)
          Array.from(li.querySelectorAll("a"))
            .map((a) => a.href)
            .forEach((a) => link.push(a));
        list = list.nextElementSibling;
      }
      return { link, text: "" };
    };
  }

  function getContentFromHeader() {
    return (s) => {
      let cont = {
        link: [],
        text: "",
      };

      const excludes = ["#Catchphrases_/_Running_Gags", "#Trivia"];
      if (excludes.includes(s)) {
        let list = document.getElementById(s.substring(1)).parentElement
          .nextElementSibling;

        let figs = list.querySelectorAll("figure");
        if (figs.length > 0) for (let fig of figs) fig.remove();

        filterLinks(Array.from(list.querySelectorAll("a")));
        cont.text += list.textContent.trim();
        return cont;
      }

      let start = document.getElementById(s.substring(1)).parentElement
        .nextElementSibling;

      let text = "";

      while (start.nodeName === "P" || start.nodeName === "FIGURE") {
        if (start.nodeName === "FIGURE") {
          start = start.nextElementSibling;
          continue;
        }

        let span = start.querySelector("span");
        if (span !== null) {
          filterLinks(Array.from(span.querySelectorAll("a")));
          start.removeChild(span);
        }

        filterLinks(Array.from(start.querySelectorAll("a")));
        text += start.textContent;
        start = start.nextElementSibling;
      }

      cont.text = text.trim();
      return cont;

      function filterLinks(links) {
        if (links.length > 0)
          for (let link of links)
            if (link.href.search("#cite") === -1) cont.link.push(link.href);
      }
    };
  }
}

function logger(message, type = "info", function_name = "", error = null) {
  message = `[${new Date().toLocaleString()}] [${type}] [${function_name}] ${message}`;

  if (error !== null) {
    message += "\n" + error;
    logStream.write(message + "\n");
    return;
  }

  logStream.write(message + "\n");
}

process.on("uncaughtException", (err) => {
  logger(err.message, "error", "uncaughtException", err.stack);
  logStream.end();
});

// getLinks();
// getCategories();
// getTableOfContent({
//   id: "Tsubasa Hanekawa",
//   url: "https://bakemonogatari.fandom.com/wiki/Tsubasa_Hanekawa",
// });

// readMap(CONTENT_DIR + "Tsubasa Hanekawa");

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
