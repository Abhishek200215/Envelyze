/* Email HTML Beautifier + Checker engine */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EmailTool = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ================================================================== */
  /* Reference data                                                      */
  /* ================================================================== */

  const words = s => String(s || "").split(/\s+/).filter(Boolean);
  const setOf = s => new Set(words(s));

  const VOID_TAGS = setOf(
    "area base br col embed hr img input link meta param source track wbr basefont frame keygen spacer"
  );

  /* Inline elements never start a new output line. */
  const INLINE_TAGS = setOf(
    "a abbr b bdi bdo big br cite code del dfn em font i img ins kbd mark nobr q s samp small span " +
    "strong sub sup time tt u var wbr o:p strike label"
  );

  const RAW_TAGS = setOf("style script pre textarea");
  const VERBATIM_TAGS = setOf("pre textarea");

  const KNOWN_TAGS = setOf(
    "a abbr acronym address area article aside audio b base basefont bdi bdo big blink blockquote body br " +
    "button canvas caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt " +
    "em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr " +
    "html i iframe img input ins kbd label legend li link main map mark marquee menu meta meter nav nobr noframes " +
    "noscript object ol optgroup option output p param picture pre progress q rp rt ruby s samp script search " +
    "section select slot small source spacer span strike strong style sub summary sup table tbody td template " +
    "textarea tfoot th thead time title tr track tt u ul var video wbr xmp xml"
  );

  const BLOCK_TAGS = setOf(
    "address article aside blockquote center dd details dialog div dl dt fieldset figcaption figure footer form " +
    "h1 h2 h3 h4 h5 h6 header hgroup hr li main menu nav ol p pre section table ul"
  );

  const PHRASING_TAGS = setOf(
    "a abbr b bdi bdo big cite code del dfn em font i ins kbd label mark nobr q s samp small span strike strong " +
    "sub sup time tt u var"
  );

  const HEAD_TAGS = setOf("title meta link style script base noscript template xml");
  const TABLE_SECTIONS = setOf("table tbody thead tfoot");

  /* tag -> [level, message]. Messages are shared so repeats fold together. */
  const FORM_MSG = "Form controls are stripped or disabled in many clients (Gmail, Outlook) — link to a web page instead";
  const EMAIL_UNSUPPORTED = {
    script: ["error", "<script> is stripped by every email client — JavaScript never runs in email"],
    iframe: ["error", "<iframe> is stripped by almost every email client"],
    frame: ["error", "<frame> is not supported in email"],
    frameset: ["error", "<frameset> is not supported in email"],
    object: ["error", "<object> is stripped by email clients"],
    embed: ["error", "<embed> is stripped by email clients"],
    applet: ["error", "<applet> is not supported anywhere any more"],
    canvas: ["error", "<canvas> needs JavaScript, which email clients strip"],
    form: ["warn", FORM_MSG],
    input: ["warn", FORM_MSG],
    button: ["warn", FORM_MSG],
    select: ["warn", FORM_MSG],
    textarea: ["warn", FORM_MSG],
    video: ["warn", "<video>/<audio> only play in a few clients (mainly Apple Mail) — make sure there is a fallback"],
    audio: ["warn", "<video>/<audio> only play in a few clients (mainly Apple Mail) — make sure there is a fallback"],
    svg: ["warn", "Inline <svg> is not supported in Gmail or Outlook — use a PNG or JPG"],
    base: ["warn", "<base> is ignored by most email clients — use absolute URLs"],
    marquee: ["warn", "<marquee>/<blink> are obsolete and unsupported in most clients"],
    blink: ["warn", "<marquee>/<blink> are obsolete and unsupported in most clients"]
  };

  const KNOWN_ATTRS = setOf(
    "abbr accept accept-charset accesskey action align alink allow allowfullscreen alt archive aria async " +
    "autocapitalize autocomplete autofocus autoplay axis background bgcolor border bordercolor bordercolordark " +
    "bordercolorlight bottommargin cellpadding cellspacing char charoff charset checked cite class classid clear " +
    "code codebase codetype color cols colspan compact content contenteditable controls coords crossorigin data " +
    "datetime decoding default defer dir dirname disabled download draggable enctype enterkeyhint face fetchpriority " +
    "for form formaction frame frameborder headers height hidden high href hreflang hspace http-equiv id inert " +
    "inputmode integrity is ismap itemid itemprop itemref itemscope itemtype kind label lang leftmargin link list " +
    "loading longdesc loop low marginheight marginwidth max maxlength media method min minlength multiple muted " +
    "name nonce noresize noshade novalidate nowrap open optimum part pattern ping placeholder playsinline popover " +
    "poster preload profile property readonly referrerpolicy rel required rev reversed rightmargin role rows rowspan " +
    "rules sandbox scheme scope scrolling selected shape size sizes slot span spellcheck src srcdoc srclang srcset " +
    "standby start step style summary tabindex target text title topmargin translate type usemap valign value " +
    "valuetype version vlink vspace width wrap x-apple-data-detectors xmlns"
  );

  /* Attributes that editors and ESPs add on purpose — not typos. */
  const ESP_ATTRS = setOf(
    "editable layout multiline singleline repeater alias conversion mktoname mktoimgsrc mktoimgwidth " +
    "mktoimgheight mktoimgclass mktolockimgsize mktolockimgstyle mktoimglink mktoimglinktarget mktoedit " +
    "data-hs-cos-general-type data-hs-cos-type"
  );

  /* Attribute -> elements it actually works on. */
  const ATTR_ONLY_ON = {
    cellpadding: setOf("table"),
    cellspacing: setOf("table"),
    colspan: setOf("td th"),
    rowspan: setOf("td th"),
    valign: setOf("td th tr tbody thead tfoot col colgroup"),
    bgcolor: setOf("body table tr td th tbody thead tfoot col colgroup"),
    background: setOf("body table tr td th"),
    href: setOf("a area link base"),
    src: setOf("img script iframe embed input source track audio video frame"),
    alt: setOf("img area input"),
    face: setOf("font basefont"),
    action: setOf("form"),
    method: setOf("form")
  };

  const ALIGN_VALUES = {
    table: setOf("left center right"),
    img: setOf("left right top middle bottom absmiddle absbottom baseline texttop"),
    caption: setOf("top bottom left right"),
    hr: setOf("left center right"),
    block: setOf("left center right justify")
  };
  const ALIGN_BLOCK_TAGS = setOf("td th tr div p h1 h2 h3 h4 h5 h6 thead tbody tfoot col colgroup");

  const COLOR_ATTRS = setOf("bgcolor color bordercolor text link vlink alink");
  const INT_ATTRS = setOf("border cellpadding cellspacing hspace vspace marginwidth marginheight leftmargin topmargin");

  const NAMED_COLORS = setOf(
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood " +
    "cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod " +
    "darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
    "darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray " +
    "dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green " +
    "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon " +
    "lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon " +
    "lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
    "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue " +
    "mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy " +
    "oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred " +
    "papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon " +
    "sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue " +
    "tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor"
  );

  const CSS_PROPS = setOf(
    "accent-color align-content align-items align-self all animation animation-delay animation-direction " +
    "animation-duration animation-fill-mode animation-iteration-count animation-name animation-play-state " +
    "animation-timing-function appearance ascent-override aspect-ratio backdrop-filter backface-visibility " +
    "background background-attachment background-blend-mode background-clip background-color background-image " +
    "background-origin background-position background-position-x background-position-y background-repeat " +
    "background-size block-size border border-block border-block-end border-block-start border-bottom " +
    "border-bottom-color border-bottom-left-radius border-bottom-right-radius border-bottom-style " +
    "border-bottom-width border-collapse border-color border-end-end-radius border-end-start-radius border-image " +
    "border-inline border-inline-end border-inline-start border-left border-left-color border-left-style " +
    "border-left-width border-radius border-right border-right-color border-right-style border-right-width " +
    "border-spacing border-start-end-radius border-start-start-radius border-style border-top border-top-color " +
    "border-top-left-radius border-top-right-radius border-top-style border-top-width border-width bottom " +
    "box-decoration-break box-shadow box-sizing break-after break-before break-inside caption-side caret-color " +
    "clear clip clip-path color color-scheme column-count column-gap column-rule column-span column-width columns " +
    "contain container content content-visibility counter-increment counter-reset cursor descent-override direction " +
    "display empty-cells filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font " +
    "font-display font-family font-feature-settings font-kerning font-optical-sizing font-size font-size-adjust " +
    "font-stretch font-style font-synthesis font-variant font-variant-caps font-variant-ligatures " +
    "font-variant-numeric font-variation-settings font-weight forced-color-adjust gap grid grid-area " +
    "grid-auto-columns grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-gap grid-column-start " +
    "grid-gap grid-row grid-row-end grid-row-gap grid-row-start grid-template grid-template-areas " +
    "grid-template-columns grid-template-rows hanging-punctuation height hyphens image-orientation image-rendering " +
    "inline-size inset inset-block inset-inline isolation justify-content justify-items justify-self left " +
    "letter-spacing line-break line-clamp line-gap-override line-height list-style list-style-image " +
    "list-style-position list-style-type margin margin-block margin-block-end margin-block-start margin-bottom " +
    "margin-inline margin-inline-end margin-inline-start margin-left margin-right margin-top mask mask-image " +
    "max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size min-width " +
    "mix-blend-mode object-fit object-position opacity order orphans outline outline-color outline-offset " +
    "outline-style outline-width overflow overflow-wrap overflow-x overflow-y overscroll-behavior padding " +
    "padding-block padding-block-end padding-block-start padding-bottom padding-inline padding-inline-end " +
    "padding-inline-start padding-left padding-right padding-top page-break-after page-break-before " +
    "page-break-inside perspective place-content place-items place-self pointer-events position print-color-adjust " +
    "quotes resize right rotate row-gap scale scroll-behavior scroll-snap-type shape-outside size size-adjust speak " +
    "src tab-size table-layout text-align text-align-last text-decoration text-decoration-color " +
    "text-decoration-line text-decoration-skip-ink text-decoration-style text-decoration-thickness text-emphasis " +
    "text-indent text-justify text-orientation text-overflow text-rendering text-shadow text-size-adjust " +
    "text-transform text-underline-offset text-underline-position text-wrap top touch-action transform " +
    "transform-origin transform-style transition transition-delay transition-duration transition-property " +
    "transition-timing-function translate unicode-bidi unicode-range user-select vertical-align visibility " +
    "white-space widows width will-change word-break word-spacing word-wrap writing-mode z-index zoom"
  );

  const LENGTH_PROPS = setOf(
    "width height min-width max-width min-height max-height padding padding-top padding-right padding-bottom " +
    "padding-left margin margin-top margin-right margin-bottom margin-left font-size top right bottom left " +
    "border border-top border-right border-bottom border-left border-width border-top-width border-right-width " +
    "border-bottom-width border-left-width border-radius border-top-left-radius border-top-right-radius " +
    "border-bottom-left-radius border-bottom-right-radius letter-spacing word-spacing text-indent gap row-gap " +
    "column-gap outline outline-width outline-offset flex-basis"
  );

  const STRING_VALUE_PROPS = setOf(
    "font-family content quotes font-feature-settings font-variation-settings grid-template-areas src font " +
    "-webkit-locale mso-font-alt"
  );

  const GENERIC_FONTS = setOf(
    "serif sans-serif monospace cursive fantasy system-ui ui-serif ui-sans-serif ui-monospace ui-rounded emoji " +
    "math fangsong inherit initial unset revert"
  );

  /* shorthand -> the longhands it resets */
  const SHORTHANDS = {
    padding: setOf("padding-top padding-right padding-bottom padding-left"),
    margin: setOf("margin-top margin-right margin-bottom margin-left"),
    border: setOf(
      "border-width border-style border-color border-top border-right border-bottom border-left border-top-width " +
      "border-right-width border-bottom-width border-left-width border-top-style border-right-style " +
      "border-bottom-style border-left-style border-top-color border-right-color border-bottom-color border-left-color"
    ),
    "border-top": setOf("border-top-width border-top-style border-top-color"),
    "border-right": setOf("border-right-width border-right-style border-right-color"),
    "border-bottom": setOf("border-bottom-width border-bottom-style border-bottom-color"),
    "border-left": setOf("border-left-width border-left-style border-left-color"),
    background: setOf(
      "background-color background-image background-repeat background-position background-size background-attachment " +
      "background-origin background-clip"
    ),
    font: setOf("font-size font-family font-weight font-style font-variant line-height font-stretch"),
    "border-radius": setOf(
      "border-top-left-radius border-top-right-radius border-bottom-left-radius border-bottom-right-radius"
    ),
    "list-style": setOf("list-style-type list-style-position list-style-image"),
    "text-decoration": setOf("text-decoration-line text-decoration-color text-decoration-style text-decoration-thickness")
  };

  /* HTML 4 entity names (all of them) plus &apos;. Others are HTML5 only. */
  const LATIN1_NAMES = words(
    "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute " +
    "micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig " +
    "Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash " +
    "Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute " +
    "ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc " +
    "uuml yacute thorn yuml"
  );

  const EXTRA_ENTITY = {
    0x22: "quot", 0x26: "amp", 0x3C: "lt", 0x3E: "gt", 0x27: "apos",
    0x152: "OElig", 0x153: "oelig", 0x160: "Scaron", 0x161: "scaron", 0x178: "Yuml", 0x192: "fnof", 0x2C6: "circ",
    0x2DC: "tilde", 0x2002: "ensp", 0x2003: "emsp", 0x2009: "thinsp", 0x200C: "zwnj", 0x200D: "zwj", 0x200E: "lrm",
    0x200F: "rlm", 0x2013: "ndash", 0x2014: "mdash", 0x2018: "lsquo", 0x2019: "rsquo", 0x201A: "sbquo",
    0x201C: "ldquo", 0x201D: "rdquo", 0x201E: "bdquo", 0x2020: "dagger", 0x2021: "Dagger", 0x2022: "bull",
    0x2026: "hellip", 0x2030: "permil", 0x2032: "prime", 0x2033: "Prime", 0x2039: "lsaquo", 0x203A: "rsaquo",
    0x203E: "oline", 0x2044: "frasl", 0x20AC: "euro", 0x2122: "trade", 0x2190: "larr", 0x2191: "uarr",
    0x2192: "rarr", 0x2193: "darr", 0x2194: "harr", 0x2212: "minus", 0x2248: "asymp", 0x2260: "ne", 0x2264: "le",
    0x2265: "ge", 0x25CA: "loz", 0x2660: "spades", 0x2663: "clubs", 0x2665: "hearts", 0x2666: "diams"
  };

  const ENTITY_BY_CODE = new Map();
  LATIN1_NAMES.forEach((name, i) => ENTITY_BY_CODE.set(0xA0 + i, name));
  Object.keys(EXTRA_ENTITY).forEach(code => ENTITY_BY_CODE.set(Number(code), EXTRA_ENTITY[code]));

  const KNOWN_ENTITIES = new Set(Array.from(ENTITY_BY_CODE.values()).concat(words(
    "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho Sigma Tau Upsilon Phi " +
    "Chi Psi Omega alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf " +
    "sigma tau upsilon phi chi psi omega thetasym upsih piv weierp image real alefsym crarr lArr uArr rArr dArr hArr " +
    "forall part exist empty nabla isin notin ni prod sum lowast radic prop infin ang and or cap cup int there4 sim " +
    "cong equiv sub sup nsub sube supe oplus otimes perp sdot lceil rceil lfloor rfloor lang rang"
  )));

  /* Windows-1252 code points that are often written as &#128;-&#159;. */
  const CP1252 = {
    128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352,
    139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212,
    152: 732, 153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376
  };

  /* ASCII checker list — taken from the DARTmail Helper's CheckHTML() routine.
     Every character here is flagged and given an entity to replace it with. */
  const ASCII_CHECK_CHARS = Array.from(new Set(Array.from(
    "$‘“”©®ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÕÖØÙÚÛÜÝ÷Ÿ¡¢£¥¦§ª°±´µ•~€‚ƒ…†‡ŠŒŽ–—žÞßàáâãäåçèéêëìíîïðñòóôõö¹þ¿™œÿùúûý›šæ’¨ùúû·"
  )));
  const ASCII_CHECK_SET = new Set(ASCII_CHECK_CHARS);

  /* Characters nobody sees but that still break layouts, links and filters. */
  const INVISIBLE_CHARS = {
    0x00A0: "non-breaking space", 0x00AD: "soft hyphen", 0x200B: "zero-width space",
    0x200C: "zero-width non-joiner", 0x200D: "zero-width joiner", 0x2060: "word joiner",
    0xFEFF: "byte-order mark", 0x2028: "line separator", 0x2029: "paragraph separator"
  };

  /* Readable names for the characters the checker reports. */
  const CHAR_NAMES = {
    0x24: "Dollar sign", 0x7E: "Tilde",
    0xA0: "No-break space", 0xA1: "Inverted exclamation mark", 0xA2: "Cent sign", 0xA3: "Pound sign",
    0xA4: "Currency sign", 0xA5: "Yen sign", 0xA6: "Broken bar", 0xA7: "Section sign", 0xA8: "Diaeresis",
    0xA9: "Copyright sign", 0xAA: "Feminine ordinal", 0xAB: "Left guillemet", 0xAC: "Not sign", 0xAD: "Soft hyphen",
    0xAE: "Registered sign", 0xAF: "Macron", 0xB0: "Degree sign", 0xB1: "Plus-minus sign", 0xB2: "Superscript two",
    0xB3: "Superscript three", 0xB4: "Acute accent", 0xB5: "Micro sign", 0xB6: "Paragraph sign", 0xB7: "Middle dot",
    0xB8: "Cedilla", 0xB9: "Superscript one", 0xBA: "Masculine ordinal", 0xBB: "Right guillemet",
    0xBC: "One quarter", 0xBD: "One half", 0xBE: "Three quarters", 0xBF: "Inverted question mark",
    0xC6: "Capital AE ligature", 0xD0: "Capital Eth", 0xD7: "Multiplication sign", 0xDE: "Capital Thorn",
    0xDF: "Sharp s (Eszett)", 0xE6: "Small ae ligature", 0xF0: "Small eth", 0xF7: "Division sign", 0xFE: "Small thorn",
    0x152: "Capital OE ligature", 0x153: "Small oe ligature", 0x17D: "Capital Z with caron", 0x17E: "Small z with caron",
    0x192: "Florin (f with hook)", 0x2C6: "Circumflex accent", 0x2DC: "Small tilde",
    0x2002: "En space", 0x2003: "Em space", 0x2009: "Thin space", 0x200E: "Left-to-right mark", 0x200F: "Right-to-left mark",
    0x2013: "En dash", 0x2014: "Em dash", 0x2018: "Left single quote", 0x2019: "Right single quote / apostrophe",
    0x201A: "Low single quote", 0x201C: "Left double quote", 0x201D: "Right double quote", 0x201E: "Low double quote",
    0x2020: "Dagger", 0x2021: "Double dagger", 0x2022: "Bullet", 0x2026: "Ellipsis", 0x2030: "Per mille sign",
    0x2032: "Prime", 0x2033: "Double prime", 0x2039: "Single left angle quote", 0x203A: "Single right angle quote",
    0x20AC: "Euro sign", 0x20B9: "Indian rupee sign", 0x2122: "Trade mark sign", 0x2190: "Left arrow",
    0x2192: "Right arrow", 0x2212: "Minus sign", 0x2264: "Less-than or equal", 0x2265: "Greater-than or equal",
    0x2713: "Check mark", 0x2605: "Black star"
  };
  const DIACRITICS = {
    acute: "acute", grave: "grave", circ: "circumflex", tilde: "tilde", uml: "umlaut", ring: "ring",
    cedil: "cedilla", slash: "stroke", caron: "caron"
  };
  const INVISIBLE_SHORT = {
    0x00A0: "NBSP", 0x00AD: "SHY", 0x200B: "ZWSP", 0x200C: "ZWNJ", 0x200D: "ZWJ", 0x2060: "WJ",
    0xFEFF: "BOM", 0x2028: "LSEP", 0x2029: "PSEP"
  };

  function charName(cp) {
    if (CHAR_NAMES[cp]) return CHAR_NAMES[cp];
    if (INVISIBLE_CHARS[cp]) return INVISIBLE_CHARS[cp].charAt(0).toUpperCase() + INVISIBLE_CHARS[cp].slice(1);
    const entity = ENTITY_BY_CODE.get(cp);
    const m = entity && /^([A-Za-z])(acute|grave|circ|tilde|uml|ring|cedil|slash|caron)$/.exec(entity);
    if (m) return (m[1] === m[1].toUpperCase() ? "Capital " : "Small ") + m[1] + " with " + DIACRITICS[m[2]];
    if (cp >= 0x1F000 && cp <= 0x1FAFF) return "Emoji";
    if (cp >= 0x2600 && cp <= 0x27BF) return "Symbol";
    if (cp >= 0x0900 && cp <= 0x0DFF) return "Indic script letter";
    if (cp >= 0x4E00 && cp <= 0x9FFF) return "CJK ideograph";
    if (cp >= 0x0400 && cp <= 0x04FF) return "Cyrillic letter";
    if (cp >= 0x0370 && cp <= 0x03FF) return "Greek letter";
    if (cp >= 0x0600 && cp <= 0x06FF) return "Arabic letter";
    return "Character " + hexCode(cp);
  }

  /* Classes injected by email clients themselves. They are never present
     in the HTML, so "unused" is the wrong conclusion for them. */
  const PROTECTED_CLASS = [
    /^mso/i, /^ExternalClass/i, /^ReadMsgBody$/i, /^yshortcuts$/i, /^applelinks?$/i,
    /^a3s$/i, /^a6S$/i, /^adL$/i, /^ii$/i, /^im$/i, /^gmail/i, /^m_-?\d/, /^x_/,
    /^moz-/i, /^ios-/i, /^yiv\d/i, /^outlook/i, /^ymail/i, /^apple-/i, /^Singleton$/i
  ];
  const PROTECTED_ID = [/^outlook$/i, /^MessageViewBody$/i, /^MessageWebViewDiv$/i, /^ogw/i, /^body$/i];

  /* Attributes that must never be stripped when empty — removing them
     changes behaviour, or an email client wrote them on purpose. */
  const KEEP_EMPTY = setOf("alt href src srcset value content name lang id action for");

  const EDITOR_META = setOf("generator progid originator vs_targetschema vs_defaultclientscript code_language");

  const GENERIC_ALT = setOf("image img photo picture pic graphic banner untitled placeholder spacer icon alt");
  const GENERIC_LINK_TEXT = new Set(["click here", "here", "click", "read more", "more", "link", "this link", "learn more here"]);

  const isProtectedClass = name => PROTECTED_CLASS.some(re => re.test(name));
  const isProtectedId = name => PROTECTED_ID.some(re => re.test(name));

  /* ================================================================== */
  /* Small helpers                                                       */
  /* ================================================================== */

  /* Optimal string alignment distance (Levenshtein + adjacent swaps). */
  function editDistance(a, b) {
    const m = a.length;
    const n = b.length;
    const d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
  }

  /* Closest known name, only when it is plausibly a typo. */
  function suggest(name, known) {
    if (name.length < 3) return null;
    const limit = name.length <= 5 ? 1 : 2;
    let best = null;
    let bestScore = Infinity;
    for (const candidate of known) {
      if (Math.abs(candidate.length - name.length) > limit) continue;
      const distance = editDistance(name, candidate);
      if (distance > limit) continue;
      /* ties go to the candidate that starts the same way */
      let prefix = 0;
      while (prefix < name.length && name[prefix] === candidate[prefix]) prefix++;
      const score = distance * 100 - prefix;
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    return best;
  }

  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  function snippet(text, max) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const limit = max || 70;
    return clean.length > limit ? clean.slice(0, limit - 1) + "…" : clean;
  }

  function hexCode(cp) {
    return "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  }

  function entityFor(cp) {
    const name = ENTITY_BY_CODE.get(cp);
    return name ? "&" + name + ";" : "&#" + cp + ";";
  }

  /* ESP merge-tag syntaxes, plus DARTmail style #FIELD# profile fields. */
  const MERGE_RES = [
    { re: /\{\{[\s\S]*?\}\}/g, kind: "{{ }}" },
    { re: /\{%[\s\S]*?%\}/g, kind: "{% %}" },
    { re: /%%[^%\s<>][^%<>]*?%%/g, kind: "%% %%" },
    { re: /\*\|[^|]*?\|\*/g, kind: "*| |*" },
    { re: /\$\{[^}]*\}/g, kind: "${ }" },
    { re: /\[\[[^\]]*\]\]/g, kind: "[[ ]]" },
    { re: /#[A-Za-z_][A-Za-z0-9_.-]*#/g, kind: "# #" }
  ];

  function stripMergeTags(text, filler) {
    let out = String(text || "");
    for (const m of MERGE_RES) out = out.replace(m.re, filler === undefined ? " " : filler);
    return out;
  }

  function hasMergeTag(text) {
    return MERGE_RES.some(m => { m.re.lastIndex = 0; const hit = m.re.test(text); m.re.lastIndex = 0; return hit; });
  }

  /* Returns a message if merge-tag delimiters do not pair up. */
  function mergeBalance(text) {
    const count = (re) => (String(text).match(re) || []).length;
    if (count(/\{\{/g) !== count(/\}\}/g)) return "{{ }}";
    if (count(/\{%/g) !== count(/%\}/g)) return "{% %}";
    if (count(/\*\|/g) !== count(/\|\*/g)) return "*| |*";
    if (count(/\[\[/g) !== count(/\]\]/g)) return "[[ ]]";
    if (/\$\{[^}]*$/.test(text)) return "${ }";
    const pct = String(text).replace(/%%=/g, "%%").match(/%%/g);
    if (pct && pct.length % 2 === 1) return "%% %%";
    return null;
  }

  /* ================================================================== */
  /* Tokenizer                                                           */
  /* ================================================================== */

  /* "/>" closes the tag, unless the slash belongs to an unquoted value
     such as <a href=https://example.com/> */
  function closesItself(raw) {
    if (!/\/\s*>$/.test(raw)) return false;
    return !/=\s*[^\s"'=<>`]+\/\s*>$/.test(raw);
  }

  function tokenize(src) {
    const tokens = [];
    let i = 0;
    let line = 1;

    const push = (type, value, extra) => {
      const token = Object.assign({ type: type, value: value, srcLine: line, idx: tokens.length }, extra || {});
      tokens.push(token);
      for (let k = 0; k < value.length; k++) if (value[k] === "\n") line++;
      return token;
    };

    while (i < src.length) {
      if (src[i] !== "<") {
        const next = src.indexOf("<", i);
        const end = next === -1 ? src.length : next;
        push("text", src.slice(i, end));
        i = end;
        continue;
      }

      const ahead = src.slice(i, i + 300);

      /* <![endif]-->  /  <!--<![endif]-->  /  <!--[endif]--> */
      const condClose =
        /^<!--\s*<!\[endif\]\s*-->/i.exec(ahead) ||
        /^<!--\s*\[endif\]\s*-->/i.exec(ahead) ||
        /^<!\s*\[endif\]\s*-->/i.exec(ahead);

      if (condClose) {
        push("cond-close", condClose[0]);
        i += condClose[0].length;
        continue;
      }

      /* <!--[if mso]>  and downlevel-revealed  <!--[if !mso]><!--> */
      const condOpen = /^<!--\s*\[if\b[^\]]*\]\s*>/i.exec(ahead);
      if (condOpen) {
        let raw = condOpen[0];
        if (src.startsWith("<!-->", i + raw.length)) raw += "<!-->";
        push("cond-open", raw);
        i += raw.length;
        continue;
      }

      if (/^<!doctype/i.test(ahead)) {
        const end = src.indexOf(">", i);
        const finish = end === -1 ? src.length : end + 1;
        push("doctype", src.slice(i, finish));
        i = finish;
        continue;
      }

      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i + 4);
        const finish = end === -1 ? src.length : end + 3;
        push("comment", src.slice(i, finish), end === -1 ? { unterminated: true } : null);
        i = finish;
        continue;
      }

      /* A "<" that cannot start a tag is literal text. */
      if (!/^<\/?[a-zA-Z!]/.test(ahead)) {
        push("text", "<");
        i++;
        continue;
      }

      /* Real tag: walk to ">" while respecting quoted values. */
      const start = i;
      let quote = null;
      let j = i + 1;
      let closed = false;

      for (; j < src.length; j++) {
        const ch = src[j];
        if (quote) {
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          /* Quotes only open a value right after "=" */
          if (/=\s*$/.test(src.slice(Math.max(start, j - 20), j))) quote = ch;
          continue;
        }
        if (ch === ">") { j++; closed = true; break; }
      }

      const raw = src.slice(start, j);
      i = j;
      const flags = closed ? null : { unterminated: true };

      const closeMatch = /^<\s*\/\s*([a-zA-Z0-9:_.-]+)/.exec(raw);
      if (closeMatch) {
        push("close", raw, Object.assign({ name: closeMatch[1].toLowerCase() }, flags));
        continue;
      }

      const openMatch = /^<\s*([a-zA-Z0-9:_.-]+)/.exec(raw);
      if (!openMatch) {
        push("text", raw);
        continue;
      }

      const name = openMatch[1].toLowerCase();
      const explicitSelf = closesItself(raw);
      const selfClosing = explicitSelf || VOID_TAGS.has(name);
      push(selfClosing ? "self" : "open", raw, Object.assign({ name: name, explicitSelf: explicitSelf }, flags));

      /* Raw content blocks keep their body untouched by the tag walker. */
      if (!selfClosing && RAW_TAGS.has(name)) {
        const closeRe = new RegExp("<\\s*/\\s*" + name + "\\s*>", "gi");
        closeRe.lastIndex = i;
        const found = closeRe.exec(src);
        const bodyEnd = found ? found.index : src.length;
        push("raw", src.slice(i, bodyEnd), { name: name, unclosedRaw: !found });
        i = bodyEnd;
      }
    }

    return tokens;
  }

  /* ================================================================== */
  /* Tag + attribute helpers                                             */
  /* ================================================================== */

  function parseTag(raw) {
    const m = /^<\s*([a-zA-Z0-9:_.-]+)/.exec(raw);
    if (!m) return null;

    let rest = raw.slice(m[0].length).replace(/>$/, "");
    let selfClose = false;

    if (closesItself(raw)) {
      selfClose = true;
      rest = rest.replace(/\/\s*$/, "");
    }

    const attrs = [];
    const re = /([^\s=\/>"']+)(\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
    let a;

    while ((a = re.exec(rest)) !== null) {
      if (!a[0].trim()) continue;

      let value = null;
      let quote = '"';

      if (a[3] !== undefined) { value = a[3]; quote = '"'; }
      else if (a[4] !== undefined) { value = a[4]; quote = "'"; }
      else if (a[5] !== undefined) { value = a[5]; quote = ""; }

      attrs.push({ name: a[1], value: value, quote: quote });
    }

    return { name: m[1], lower: m[1].toLowerCase(), attrs: attrs, selfClose: selfClose };
  }

  function serializeTag(tag) {
    const parts = [tag.name];

    for (const a of tag.attrs) {
      if (a.value === null) parts.push(a.name);
      else if (a.quote === "") parts.push(a.name + "=" + a.value);
      else parts.push(a.name + "=" + a.quote + a.value + a.quote);
    }

    return "<" + parts.join(" ") + (tag.selfClose ? " />" : ">");
  }

  function getAttr(tag, name) {
    const lower = name.toLowerCase();
    return tag.attrs.find(a => a.name.toLowerCase() === lower) || null;
  }

  function attrValue(tag, name) {
    const a = getAttr(tag, name);
    return a && a.value !== null ? a.value : null;
  }

  function setAttr(tag, name, value) {
    const found = getAttr(tag, name);
    if (found) { found.value = value; found.quote = found.quote || '"'; return found; }
    const attr = { name: name, value: value, quote: '"' };
    tag.attrs.push(attr);
    return attr;
  }

  /* Structural attributes read better before a long style attribute. */
  function insertAttrBeforeStyle(tag, name, value) {
    const existing = getAttr(tag, name);
    if (existing) { existing.value = value; existing.quote = existing.quote || '"'; return existing; }

    const attr = { name: name, value: value, quote: '"' };
    const styleIndex = tag.attrs.findIndex(a => a.name.toLowerCase() === "style");

    if (styleIndex === -1) tag.attrs.push(attr);
    else tag.attrs.splice(styleIndex, 0, attr);

    return attr;
  }

  /* Split on a separator while ignoring quotes and parentheses. */
  function safeSplit(text, sep) {
    const out = [];
    let buf = "";
    let depth = 0;
    let quote = null;

    for (const ch of text) {
      if (quote) { buf += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === sep && depth === 0) { out.push(buf); buf = ""; continue; }
      buf += ch;
    }

    out.push(buf);
    return out.map(s => s.trim()).filter(Boolean);
  }

  function parseStyleAttr(value) {
    return safeSplit(value || "", ";").map(decl => {
      const idx = decl.indexOf(":");
      if (idx === -1) return { prop: decl.trim(), value: "", bare: true };
      return {
        prop: decl.slice(0, idx).trim(),
        value: decl.slice(idx + 1).trim(),
        bare: false
      };
    });
  }

  function serializeStyleAttr(list) {
    if (!list.length) return "";
    return list.map(d => (d.bare ? d.prop : d.prop + ":" + d.value)).join(";") + ";";
  }

  const stripComments = s => String(s || "").replace(/\/\*[\s\S]*?\*\//g, " ").trim();

  /* ================================================================== */
  /* CSS parser (structure preserving enough for our checks)             */
  /* ================================================================== */

  function parseCss(src, errors) {
    const nodes = [];
    let i = 0;
    const fail = (kind, text) => { if (errors) errors.push({ kind: kind, text: text }); };

    while (i < src.length) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (i >= src.length) break;

      if (src.startsWith("/*", i)) {
        const end = src.indexOf("*/", i);
        if (end === -1) fail("comment", src.slice(i, i + 40));
        const finish = end === -1 ? src.length : end + 2;
        nodes.push({ type: "comment", text: src.slice(i, finish) });
        i = finish;
        continue;
      }

      /* HTML comment markers left inside <style> by old templates */
      if (src.startsWith("<!--", i)) { i += 4; continue; }
      if (src.startsWith("-->", i)) { i += 3; continue; }

      const open = src.indexOf("{", i);
      const semi = src.indexOf(";", i);
      const strayClose = src.indexOf("}", i);

      if (strayClose !== -1 && (open === -1 || strayClose < open) && (semi === -1 || strayClose < semi)) {
        const before = src.slice(i, strayClose).trim();
        if (before) nodes.push({ type: "statement", text: before });
        fail("stray", src.slice(i, strayClose + 1).trim());
        i = strayClose + 1;
        continue;
      }

      if (open === -1 || (semi !== -1 && semi < open)) {
        const end = semi === -1 ? src.length : semi;
        const text = src.slice(i, end).trim();
        if (text) nodes.push({ type: "statement", text: text });
        if (text && !/^@/.test(text)) fail("orphan", text);
        i = end + 1;
        continue;
      }

      const prelude = src.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      let quote = null;

      for (; j < src.length; j++) {
        const ch = src[j];
        if (quote) { if (ch === quote && src[j - 1] !== "\\") quote = null; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) break; }
      }

      if (depth !== 0) fail("unclosed", prelude || src.slice(open, open + 30));

      const body = src.slice(open + 1, Math.min(j, src.length));

      if (/^@/.test(prelude) && /\{/.test(body)) {
        nodes.push({ type: "at", prelude: prelude, children: parseCss(body, errors) });
      } else {
        nodes.push({ type: "rule", selector: prelude, decls: parseDecls(body) });
      }

      i = j + 1;
    }

    return nodes;
  }

  function parseDecls(body) {
    return safeSplit(body, ";").map(decl => {
      const idx = decl.indexOf(":");
      if (idx === -1) return { prop: decl.trim(), value: "", bare: true };
      return {
        prop: decl.slice(0, idx).trim(),
        value: decl.slice(idx + 1).trim().replace(/\s+/g, " "),
        bare: false
      };
    }).filter(d => d.prop);
  }

  function declsText(decls) {
    return decls.map(d => (d.bare ? d.prop : d.prop + ": " + d.value + ";")).join(" ");
  }

  function serializeCssInto(nodes, level, indentUnit, out) {
    const pad = indentUnit.repeat(level);

    for (const node of nodes) {
      node.outLine = out.length;

      if (node.type === "comment") { out.push(pad + node.text); continue; }
      if (node.type === "statement") { out.push(pad + node.text + ";"); continue; }

      if (node.type === "at") {
        out.push(pad + node.prelude + " {");
        serializeCssInto(node.children, level + 1, indentUnit, out);
        out.push(pad + "}");
        continue;
      }

      const body = declsText(node.decls);
      out.push(pad + node.selector + " {" + (body ? body + " " : "") + "}");
    }

    return out;
  }

  function collectSelectorClasses(selector) {
    const found = [];
    const clean = String(selector).replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)/g, m => m.replace(/\./g, " "));
    const re = /\.(-?[_a-zA-Z][\w-]*)/g;
    let m;
    while ((m = re.exec(clean)) !== null) found.push(m[1]);
    return found;
  }

  function collectSelectorIds(selector) {
    const found = [];
    const clean = String(selector).replace(/\[[^\]]*\]/g, "");
    const re = /#(-?[_a-zA-Z][\w-]*)/g;
    let m;
    while ((m = re.exec(clean)) !== null) found.push(m[1]);
    return found;
  }

  /* [class="x"], [class~=x], [class*="col"] … */
  function classPredicates(selector) {
    const out = [];
    const re = /\[\s*class\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*([iIsS])?)?\s*\]/g;
    let m;
    while ((m = re.exec(selector)) !== null) {
      const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      out.push({ op: m[1] || "", value: value === undefined ? null : value, ci: /i/i.test(m[5] || "") });
    }
    return out;
  }

  function predicateMatches(pred, classAttr) {
    let s = classAttr.trim().replace(/\s+/g, " ");
    let v = pred.value;
    if (v === null) return true;
    if (pred.ci) { s = s.toLowerCase(); v = v.toLowerCase(); }
    switch (pred.op) {
      case "=": return s === v;
      case "~=": return s.split(" ").indexOf(v) !== -1;
      case "^=": return s.startsWith(v);
      case "$=": return s.endsWith(v);
      case "*=": return s.indexOf(v) !== -1;
      case "|=": return s === v || s.startsWith(v + "-");
      default: return true;
    }
  }

  /* Duplicate declarations in one block: the cascade keeps the last one,
     unless an earlier one is marked !important. */
  function dedupeDecls(list) {
    const wins = new Map();

    list.forEach((decl, index) => {
      if (decl.bare) return;

      const key = decl.prop.toLowerCase();
      const important = /!important/i.test(decl.value);
      const current = wins.get(key);

      if (!current) { wins.set(key, { index: index, important: important }); return; }
      if (current.important && !important) return;

      wins.set(key, { index: index, important: important });
    });

    const dropped = [];
    const kept = [];

    list.forEach((decl, index) => {
      if (decl.bare) { kept.push(decl); return; }

      const win = wins.get(decl.prop.toLowerCase());
      if (win.index === index) { kept.push(decl); return; }

      dropped.push({ prop: decl.prop, value: decl.value, winner: list[win.index].value });
    });

    return { list: kept, dropped: dropped };
  }

  function normalizeLength(value) {
    const v = String(value == null ? "" : value).trim().toLowerCase();
    if (!v) return null;
    if (/^\d+(\.\d+)?$/.test(v)) return v.replace(/\.0+$/, "") + "px";
    if (/^\d+(\.\d+)?%$/.test(v)) return v.replace(/\.0+%/, "%");
    if (/^\d+(\.\d+)?px$/.test(v)) return v.replace(/\.0+px/, "px");
    return null;
  }

  function styleLength(decls, prop) {
    for (let k = decls.length - 1; k >= 0; k--) {
      if (decls[k].prop.toLowerCase() === prop) return decls[k];
    }
    return null;
  }

  function normalizeMedia(prelude) {
    return prelude
      .toLowerCase()
      .replace(/^@media\s*/, "")
      .replace(/\bonly\s+/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([(),:])\s*/g, "$1")
      .replace(/\band\(/g, "and (")
      .trim();
  }

  /* Width range a media block applies to, when it is a plain width query. */
  function mediaRange(prelude) {
    const s = normalizeMedia(prelude);
    const max = /\(max-width:(\d+(?:\.\d+)?)px\)/.exec(s);
    const min = /\(min-width:(\d+(?:\.\d+)?)px\)/.exec(s);
    const rest = s
      .replace(/\((max|min)-width:[\d.]+px\)/g, "")
      .replace(/\b(screen|all|and)\b/g, "")
      .trim();
    if (rest) return null;
    return { min: min ? Number(min[1]) : 0, max: max ? Number(max[1]) : Infinity };
  }

  /* Merge tags, anchors and non-http schemes are not broken links. */
  function isRelativeUrl(value) {
    const v = String(value == null ? "" : value).trim();
    if (!v) return false;

    if (/^(https?:)?\/\//i.test(v)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
    if (v.charAt(0) === "#") return false;

    /* ESP placeholders: {{ }}, %% %%, *| |*, ${ }, [[ ]], <% %> */
    if (/[{}%$\[\]<>|]/.test(v)) return false;

    return true;
  }

  function shortCondition(prelude) {
    return prelude
      .replace(/^@media\s*/i, "")
      .replace(/\bonly\s+/i, "")
      .replace(/\bscreen\s+and\s*/i, "")
      .replace(/\bscreen\b/i, "")
      .replace(/\s+/g, " ")
      .trim() || "@media";
  }

  function normalizeSelector(sel) {
    return safeSplit(sel, ",").join(", ").replace(/\s+/g, " ").trim();
  }

  /* ================================================================== */
  /* Outlook conditional comments: what each client actually sees        */
  /* ================================================================== */

  /* Does Outlook (Word engine) render the content of this condition? */
  function outlookSees(condition) {
    const expr = String(condition).replace(/^.*?\[if\s*/i, "").replace(/\].*$/, "");
    const toks = expr.match(/\(|\)|!|\||&|[a-zA-Z]+|\d+(?:\.\d+)?/g) || [];
    let pos = 0;

    const primary = () => {
      if (toks[pos] === "(") {
        pos++;
        const v = orExpr();
        if (toks[pos] === ")") pos++;
        return v;
      }
      let word = String(toks[pos] || "").toLowerCase();
      if (["gt", "gte", "lt", "lte"].indexOf(word) !== -1) { pos++; word = String(toks[pos] || "").toLowerCase(); }
      pos++;
      if (/^\d/.test(toks[pos] || "")) pos++;
      return word === "mso";
    };
    const unary = () => {
      if (toks[pos] === "!") { pos++; return !unary(); }
      return primary();
    };
    const andExpr = () => {
      let v = unary();
      while (toks[pos] === "&") { pos++; const r = unary(); v = v && r; }
      return v;
    };
    const orExpr = () => {
      let v = andExpr();
      while (toks[pos] === "|") { pos++; const r = andExpr(); v = v || r; }
      return v;
    };

    return orExpr();
  }

  /* Split the token stream into "what Outlook renders" and "what every
     other client renders" so ghost tables validate correctly. */
  function buildViews(tokens, report) {
    const web = [];
    const mso = [];
    const stack = [];

    tokens.forEach(token => {
      if (token.type === "cond-open") {
        const revealed = /<!-->$/.test(token.value);
        const seen = outlookSees(token.value);
        const parent = stack.length ? stack[stack.length - 1] : { web: true, mso: true };

        if (!revealed && !seen) {
          report(token, "warn",
            "Conditional " + snippet(token.value, 30) + " hides its content from every client — write it as <!--[if !mso]><!--> … <!--<![endif]-->",
            "Without <!--> after the condition, non-Outlook clients treat the block as a comment.");
        }

        stack.push({ token: token, revealed: revealed, web: parent.web && revealed, mso: parent.mso && seen });
        return;
      }

      if (token.type === "cond-close") {
        const frame = stack.pop();
        if (!frame) {
          report(token, "error", "<![endif]--> has no matching <!--[if …]>", "");
          return;
        }
        if (frame.revealed && !/^<!--/.test(token.value)) {
          report(token, "error",
            "Block opened with <!--[if …]><!--> must close with <!--<![endif]--> — other clients show \"-->\" as text",
            "Opened at: " + snippet(frame.token.value, 40));
        }
        return;
      }

      const top = stack.length ? stack[stack.length - 1] : null;

      if (top && !top.revealed && token.type === "comment") {
        report(token, "error",
          "HTML comment inside an Outlook-only block — its --> ends the block early, so other clients show the rest",
          snippet(token.value, 60));
      }

      if (!top || top.web) web.push(token);
      if (!top || top.mso) mso.push(token);
    });

    stack.forEach(frame => {
      report(frame.token, "error", "Conditional comment is never closed with <![endif]-->", snippet(frame.token.value, 40));
    });

    return { web: web, mso: mso };
  }

  /* ---------------- colours + contrast ---------------- */

  const BASIC_COLORS = {
    white: "#ffffff", black: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", gray: "#808080",
    grey: "#808080", silver: "#c0c0c0", yellow: "#ffff00", orange: "#ffa500", purple: "#800080", navy: "#000080",
    maroon: "#800000", teal: "#008080", olive: "#808000", lime: "#00ff00", aqua: "#00ffff", fuchsia: "#ff00ff",
    darkgray: "#a9a9a9", darkgrey: "#a9a9a9", lightgray: "#d3d3d3", lightgrey: "#d3d3d3", gainsboro: "#dcdcdc",
    whitesmoke: "#f5f5f5", dimgray: "#696969", dimgrey: "#696969", darkblue: "#00008b", darkred: "#8b0000"
  };

  /* "#abc" / "#aabbcc" / "rgb(…)" / basic names -> [r, g, b]; null when unknown */
  function parseColor(value) {
    let v = String(value || "").replace(/!\s*important/i, "").trim().toLowerCase();
    if (BASIC_COLORS[v]) v = BASIC_COLORS[v];
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    if (m) return [m[1] + m[1], m[2] + m[2], m[3] + m[3]].map(h => parseInt(h, 16));
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(v);
    if (m) return [m[1], m[2], m[3]].map(h => parseInt(h, 16));
    m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
    if (m && (m[4] === undefined || Number(m[4]) >= 1)) return [Number(m[1]), Number(m[2]), Number(m[3])];
    return null;
  }

  const colorHex = rgb => "#" + rgb.map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");

  function luminance(rgb) {
    const ch = rgb.map(n => {
      const c = n / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function styleMap(value) {
    const map = {};
    parseStyleAttr(value || "").forEach(d => { if (!d.bare) map[d.prop.toLowerCase()] = d.value; });
    return map;
  }

  /* Left-over dummy copy that ships more often than anyone admits. */
  const PLACEHOLDER_RES = [
    /\blorem ipsum\b/i,
    /\b(TODO|TBD|FIXME)\b/,
    /\bXXX+\b/,
    /\b[xX]{2}[.,][xX]{2}\b/,
    /\[\s*(insert|add|enter|your)\b[^\]]*\]/i,
    /\b(your|insert|add|enter) (text|copy|headline|title|name|content|link|image|url) here\b/i,
    /\b(sample|dummy|placeholder) (text|copy|content)\b/i,
    /\btext here\b/i
  ];

  function findPlaceholder(text) {
    const plain = stripMergeTags(text, "Name");
    for (const re of PLACEHOLDER_RES) {
      const m = re.exec(plain);
      if (m) return snippet(plain.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25), 70);
    }
    return null;
  }

  /* Rows with different cell counts, and cell widths wider than the table. */
  function checkTables(list, report) {
    const tables = [];
    const finishRow = t => { if (t.row) { t.rows.push(t.row); t.row = null; } };

    const evaluate = t => {
      finishRow(t);
      const counts = t.rows.map(r => r.cells).filter(n => n > 0);
      const distinct = Array.from(new Set(counts));
      if (!t.rowspan && distinct.length > 1) {
        report(t.token, "warn",
          "Rows in this table have different cell counts — add colspan or the missing <td>",
          "Cells per row: " + counts.join(", "), "table-layout");
      }

      const tableWidth = /^\d+$/.test(t.width) ? Number(t.width) : 0;
      if (!tableWidth) return;
      const spacing = /^\d+$/.test(t.cellspacing) ? Number(t.cellspacing) : 0;
      t.rows.forEach(r => {
        if (!r.widths.length) return;
        const sum = r.widths.reduce((a, b) => a + b, 0) + (spacing ? spacing * (r.cells + 1) : 0);
        if (sum > tableWidth) {
          report(r.token, "warn",
            "Cell widths add up to more than the table width — Outlook stretches the table",
            "cells " + r.widths.join(" + ") + (spacing ? " + cellspacing" : "") + " = " + sum + "  vs  table width=\"" + tableWidth + "\"",
            "table-layout");
        }
      });
    };

    for (const token of list) {
      if (token.type !== "open" && token.type !== "self" && token.type !== "close") continue;
      const name = token.name;

      if (token.type === "close") {
        if (name === "tr" && tables.length) finishRow(tables[tables.length - 1]);
        if (name === "table" && tables.length) evaluate(tables.pop());
        continue;
      }

      if (name === "table" && token.type === "open") {
        const tag = parseTag(token.value);
        tables.push({
          token: token,
          width: String(attrValue(tag, "width") || "").trim(),
          cellspacing: String(attrValue(tag, "cellspacing") || "").trim(),
          rows: [],
          row: null,
          rowspan: false
        });
        continue;
      }

      if (!tables.length) continue;
      const t = tables[tables.length - 1];

      if (name === "tr") {
        finishRow(t);
        t.row = { token: token, cells: 0, widths: [] };
        continue;
      }

      if ((name === "td" || name === "th") && t.row) {
        const tag = parseTag(token.value);
        const span = parseInt(attrValue(tag, "colspan") || "1", 10) || 1;
        const rowspan = String(attrValue(tag, "rowspan") || "").trim();
        if (rowspan && rowspan !== "1") t.rowspan = true;
        t.row.cells += span;
        const w = String(attrValue(tag, "width") || "").trim();
        if (/^\d+$/.test(w)) t.row.widths.push(Number(w));
      }
    }
  }

  /* Element tree check, run once per client view. */
  function validateStructure(list, report) {
    const stack = [];
    let autoClosedP = 0;
    let htmlClosed = false;
    const seen = { html: 0, head: 0, body: 0 };

    const topFrame = () => {
      for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name.indexOf(":") === -1) return stack[k];
      return null;
    };
    const has = name => stack.some(f => f.name === name);

    for (const token of list) {
      if (token.type === "text") {
        if (!token.value.trim()) continue;

        if (htmlClosed) { report(token, "warn", "Content after </html> — clients drop it or show it in odd places", snippet(token.value)); continue; }

        const frame = topFrame();
        if (frame && (TABLE_SECTIONS.has(frame.name) || frame.name === "tr")) {
          report(token, "error", "Text directly inside <" + frame.name + "> — browsers move it outside the table", snippet(token.value));
        } else if (frame && frame.name === "head") {
          report(token, "error", "Text inside <head> — browsers push it into the body", snippet(token.value));
        }
        continue;
      }

      if (token.type !== "open" && token.type !== "self" && token.type !== "close") continue;

      const name = token.name;
      const namespaced = name.indexOf(":") !== -1;

      if (token.type === "close") {
        if (VOID_TAGS.has(name)) continue;

        let found = -1;
        for (let k = stack.length - 1; k >= 0; k--) if (stack[k].name === name) { found = k; break; }

        if (found === -1) {
          if (name === "p" && autoClosedP) { autoClosedP--; continue; }
          /* browsers add <tbody> themselves, so </tbody> without one is fine */
          if (name === "tbody" && has("table")) continue;
          report(token, "error", "Closing </" + name + "> has no matching opening tag", "");
          continue;
        }

        for (let k = stack.length - 1; k > found; k--) {
          report(stack[k].token, "warn", "<" + stack[k].name + "> is never closed", "Closed implicitly by </" + name + ">");
        }

        stack.length = found;
        if (name === "html") htmlClosed = true;
        continue;
      }

      if (htmlClosed) report(token, "warn", "Content after </html> — clients drop it or show it in odd places", snippet(token.value));

      if (!namespaced) {
        const parent = topFrame();
        const pn = parent ? parent.name : null;

        if (name === "html" || name === "head" || name === "body") {
          seen[name]++;
          if (seen[name] > 1) report(token, "error", "More than one <" + name + "> tag", "");
        }

        if (name === "body" && has("head")) {
          report(token, "warn", "<head> is not closed before <body>", "");
          const k = stack.findIndex(f => f.name === "head");
          stack.length = k;
        }

        if (pn && TABLE_SECTIONS.has(pn)) {
          const ok = pn === "table"
            ? setOf("tr tbody thead tfoot caption colgroup col script template style")
            : setOf("tr script template style");
          if (!ok.has(name)) {
            report(token, "error", "<" + name + "> directly inside <" + pn + "> — browsers move it outside the table; wrap it in <tr><td>", "");
          }
        } else if (pn === "tr" && !setOf("td th script template style").has(name)) {
          report(token, "error", "<" + name + "> directly inside <tr> — only <td> or <th> belong there", "");
        }

        if (name === "tr" && pn !== "tr" && !TABLE_SECTIONS.has(pn)) {
          report(token, "error", "<tr> is not inside a <table>", "");
        }
        if ((name === "td" || name === "th") && pn !== "tr") {
          report(token, "error", "<" + name + "> is not inside a <tr>", "");
        }
        if (setOf("tbody thead tfoot caption colgroup").has(name) && pn !== "table") {
          report(token, "error", "<" + name + "> is not directly inside a <table>", "");
        }
        if (name === "li" && !setOf("ul ol menu").has(pn)) {
          report(token, "warn", "<li> is not inside a <ul> or <ol>", "");
        }

        if (BLOCK_TAGS.has(name)) {
          let pIndex = -1;
          for (let k = stack.length - 1; k >= 0; k--) {
            const n = stack[k].name;
            if (n === "p") { pIndex = k; break; }
            if (!PHRASING_TAGS.has(n) && n.indexOf(":") === -1) break;
          }

          if (pIndex !== -1) {
            report(token, "error", "<" + name + "> inside <p> — browsers close the <p> first and leave an empty <p> behind", "");
            stack.length = pIndex;
            autoClosedP++;
          } else if (pn && PHRASING_TAGS.has(pn) && pn !== "a") {
            report(token, "warn", "Block <" + name + "> inside inline <" + pn + "> — invalid nesting that clients may restructure", "");
          }
        }

        if (name === "a" && has("a")) {
          report(token, "error", "Link inside another link — browsers close the first link early", "");
        }

        if (has("head") && !HEAD_TAGS.has(name) && name !== "head") {
          report(token, "error", "<" + name + "> inside <head> — browsers move it into the body", "");
        }

        if (name === "title" && has("body")) {
          report(token, "warn", "<title> belongs in <head>, not in <body>", "");
        }
      }

      if (token.type === "open") stack.push({ name: name, token: token });
    }

    for (const frame of stack) {
      report(frame.token, "warn", "<" + frame.name + "> is never closed", "Still open at the end of the document");
    }
  }

  /* ================================================================== */
  /* CSS value checks                                                    */
  /* ================================================================== */

  /* Checks one declaration. say(rule, level, message, detail). */
  function checkDeclaration(decl, ctx, say) {
    const propRaw = stripComments(decl.prop);
    if (!propRaw) return;

    if (decl.bare) {
      say("css", "error", "CSS declaration is missing its \":\"", ctx.label + " — " + snippet(propRaw, 50));
      return;
    }

    const prop = propRaw.toLowerCase();
    const full = stripComments(decl.value);
    const value = full.replace(/!\s*important\s*$/i, "").trim();

    if (!full) {
      say("css", "error", "CSS property \"" + prop + "\" has no value", ctx.label);
      return;
    }

    if (prop.indexOf("--") === 0) {
      if (ctx.support) say("support", "warn", "CSS custom properties (--name / var()) are not supported in Gmail or Outlook", ctx.label + " — " + prop);
      return;
    }

    const vendor = /^(-webkit-|-moz-|-ms-|-o-|mso-|-apple-|-x-)/.test(prop);

    if (!vendor && !CSS_PROPS.has(prop)) {
      const guess = suggest(prop, CSS_PROPS);
      if (guess) say("css", "error", "Unknown CSS property \"" + prop + "\" — did you mean \"" + guess + "\"?", ctx.label);
      else if (/^[a-z-]+$/.test(prop)) say("css", "warn", "Unknown CSS property \"" + prop + "\"", ctx.label);
      else say("css", "error", "Invalid CSS property name \"" + snippet(prop, 30) + "\"", ctx.label);
      return;
    }

    if (/!\s*(?!important\b)[a-z]+\s*$/i.test(full)) {
      say("css", "error", "Misspelled !important in \"" + prop + "\"", ctx.label + " — " + snippet(full, 50));
    }

    /* A value that holds another "prop: value" means a ";" is missing */
    const scrubbed = value
      .replace(/url\([^)]*\)/gi, "")
      .replace(/"[^"]*"|'[^']*'/g, "")
      .replace(/progid:[^;]*/gi, "")
      .replace(/expression\([^)]*\)/gi, "");
    if (/(^|\s)-?[a-z][a-z-]{2,}\s*:\s*\S/i.test(scrubbed)) {
      say("css", "error", "Missing \";\" between CSS declarations", ctx.label + " — " + prop + ": " + snippet(value, 50));
      return;
    }

    if (/^(['"]).*\1$/.test(value) && !STRING_VALUE_PROPS.has(prop) && !vendor) {
      say("css", "error", "Quoted value is invalid for \"" + prop + "\" — remove the quotes", ctx.label + " — " + prop + ": " + value);
    }

    if (prop === "font-family" && !hasMergeTag(value)) {
      const families = safeSplit(value, ",").map(f => f.replace(/^['"]|['"]$/g, "").trim().toLowerCase());
      if (families.length && !families.some(f => GENERIC_FONTS.has(f))) {
        say("css", "warn", "font-family has no generic fallback (serif / sans-serif)", ctx.label + " — " + snippet(value, 50));
      }
    }

    const outside = value.replace(/url\([^)]*\)/gi, "url()").replace(/"[^"]*"|'[^']*'/g, "\"\"");

    const hexes = outside.match(/#[0-9a-zA-Z]+\b/g) || [];
    for (const hex of hexes) {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) continue;
      if (/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(hex)) {
        if (ctx.support) say("support", "warn", "4/8-digit hex colours (with alpha) are not supported in Outlook and many clients", ctx.label + " — " + hex);
      } else {
        say("css", "error", "Invalid hex colour " + hex, ctx.label + " — " + prop);
      }
    }

    if (LENGTH_PROPS.has(prop)) {
      let flat = outside;
      while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, "");
      const parts = flat.split(/[\s,/]+/).filter(Boolean);
      const unitless = parts.filter(p => /^-?\d*\.?\d+$/.test(p) && Number(p) !== 0);
      if (unitless.length) {
        say("css", "error", "Length without a unit — browsers ignore it (add px)", ctx.label + " — " + prop + ": " + value);
      }
      if (/^padding/.test(prop) && parts.some(p => /^-\d/.test(p))) {
        say("css", "error", "Negative padding is invalid", ctx.label + " — " + prop + ": " + value);
      }
      if (/^(min-|max-)?width$/.test(prop)) {
        const pct = /^(\d+(?:\.\d+)?)%$/.exec(value);
        if (pct && Number(pct[1]) > 100) say("css", "warn", "Width over 100% — wider than its container", ctx.label + " — " + prop + ": " + value);
      }
    }

    if (!ctx.support) return;

    if (prop === "display" && /\b(inline-)?(flex|grid)\b/i.test(value)) {
      say("support", "info", "display:flex/grid is ignored by Outlook for Windows — keep a table-based fallback", ctx.label);
    }
    if (prop === "position" && !/^(static|inherit|initial)$/i.test(value)) {
      say("support", "warn", "position is stripped by Gmail and ignored by Outlook for Windows", ctx.label + " — position: " + value);
    }
    if (prop === "float") say("support", "info", "float is ignored by Outlook for Windows", ctx.label);
    if (/\bvar\(/i.test(value)) say("support", "warn", "CSS custom properties (--name / var()) are not supported in Gmail or Outlook", ctx.label + " — " + prop);
    if (/\bcalc\(/i.test(value)) say("support", "info", "calc() is ignored by Outlook for Windows", ctx.label + " — " + prop);
    if (/\d(rem|vh|vw|vmin|vmax)\b/i.test(outside)) say("support", "info", "rem/vh/vw units are ignored by Outlook for Windows — use px", ctx.label + " — " + prop + ": " + value);
    if (setOf("box-shadow transform transition animation text-shadow").has(prop)) {
      say("support", "info", prop + " is ignored by Outlook for Windows", ctx.label);
    }
    if (/^background(-image)?$/.test(prop) && /url\(/i.test(value)) ctx.onBackground && ctx.onBackground();
  }

  /* Properties whose 1-4 values follow the top / right / bottom / left rule. */
  const BOX_PROPS = setOf("padding margin border-width border-style border-color border-radius inset");

  const isZeroValue = t => /^[-+]?(0+(\.0*)?|\.0+)([a-z%]+)?$/i.test(t);

  /* "0px 0px 0px 0px" -> "0", "10px 20px 10px 20px" -> "10px 20px".
     Returns null when the value is already as short as it gets. */
  function simplifyBox(value) {
    const important = /!\s*important\s*$/i.test(value) ? " !important" : "";
    const core = String(value).replace(/!\s*important\s*$/i, "").trim();
    if (!core || /[(){}\[\]|$*\/\\,]/.test(core)) return null;

    const parts = core.split(/\s+/);
    if (parts.length > 4) return null;

    const norm = parts.map(t => (isZeroValue(t) ? "0" : t));
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const min = norm.slice();
    if (min.length === 4 && same(min[3], min[1])) min.pop();
    if (min.length === 3 && same(min[2], min[0])) min.pop();
    if (min.length === 2 && same(min[1], min[0])) min.pop();

    const collapsed = min.length < parts.length;
    const zeroUnit = norm.some((t, i) => t !== parts[i]);
    if (!collapsed && !zeroUnit) return null;

    return { minimal: min.join(" ") + important, collapsed: collapsed, zeroUnit: zeroUnit };
  }

  /* padding-top/right/bottom/left all set -> one shorthand */
  function combinableSides(decls) {
    const out = [];
    ["padding", "margin"].forEach(base => {
      const live = decls.filter(d => !d.bare);
      if (live.some(d => d.prop.toLowerCase() === base)) return;
      const sides = ["top", "right", "bottom", "left"].map(side => {
        const list = live.filter(d => d.prop.toLowerCase() === base + "-" + side);
        return list.length ? list[list.length - 1] : null;
      });
      if (sides.some(d => !d)) return;
      const important = sides.map(d => /!\s*important/i.test(d.value));
      if (important.some(i => i !== important[0])) return;
      const values = sides.map(d => d.value.replace(/!\s*important\s*$/i, "").trim());
      if (values.some(v => !v || /\s|[(){}]/.test(v))) return;
      const joined = values.join(" ") + (important[0] ? " !important" : "");
      const simple = simplifyBox(joined);
      out.push({ base: base, sides: sides, value: simple ? simple.minimal : joined });
    });
    return out;
  }

  /* Longhand followed by its own shorthand: the longhand is dead code. */
  function shorthandShadows(decls) {
    const out = [];
    decls.forEach((later, j) => {
      if (later.bare) return;
      const shorthand = later.prop.toLowerCase();
      const covers = SHORTHANDS[shorthand];
      if (!covers) return;
      const laterImportant = /!important/i.test(later.value);
      for (let i = 0; i < j; i++) {
        const earlier = decls[i];
        if (earlier.bare) continue;
        const p = earlier.prop.toLowerCase();
        if (!covers.has(p)) continue;
        if (/!important/i.test(earlier.value) && !laterImportant) continue;
        out.push({ longhand: earlier.prop + ": " + earlier.value, shorthand: later.prop + ": " + later.value });
      }
    });
    return out;
  }

  /* ================================================================== */
  /* Main entry                                                          */
  /* ================================================================== */

  function process(source, options) {
    const opts = Object.assign({
      indent: "  ",
      autofix: true,
      tableAttrs: true,
      requireBorder: true,
      widthSync: true,
      heightSync: false,
      forceWidthFix: false,
      mediaSync: true,
      crossMedia: true,
      emptyAttrs: true,
      duplicateProps: true,
      bestPractice: true,
      expandConditionals: true,
      unusedClasses: true,
      htmlValidation: true,
      cssValidation: true,
      asciiCheck: true,
      encodeChars: false,
      shortenCss: false
    }, options || {});

    const issues = [];

    const stats = {
      tags: 0,
      tables: 0,
      images: 0,
      conditionals: 0,
      mediaBlocks: 0,
      breakpoints: 0,
      lines: 0,
      inputLines: 0,
      comments: 0,
      mergeTags: 0,
      specialChars: 0,
      errors: 0,
      links: {
        total: 0,
        linked: 0,
        notLinked: 0,
        mailto: 0,
        tel: 0,
        anchor: 0,
        relative: 0,
        mergeTag: 0,
        missing: 0,
        empty: 0,
        placeholder: 0,
        http: 0,
        https: 0
      }
    };

    const addIssue = (rule, level, message, detail, fixed, where) => {
      issues.push({
        rule: rule,
        level: level,
        message: message,
        detail: detail || "",
        fixed: !!fixed,
        line: 0,
        at: where || null
      });
    };

    /* One failing check must never stop the formatting or the other
       checks: it is reported, and everything else still runs. */
    const guard = (name, fn) => {
      try {
        if (opts.failCheck === name) throw new Error("test failure");
        fn();
      } catch (error) {
        addIssue("internal", "warn", "The \"" + name + "\" check stopped early — its results may be incomplete", String(error && error.message || error), false);
        if (typeof console !== "undefined" && console.error) console.error("EmailTool check failed:", name, error);
      }
    };

    const src = String(source || "").replace(/\r\n?/g, "\n").replace(/^\s+|\s+$/g, "");
    if (!src) return { html: "", issues: issues, stats: stats, characters: [] };

    stats.inputLines = src.split("\n").length;

    const tokens = tokenize(src);
    const hasConditionals = tokens.some(t => t.type === "cond-open");

    /* ---------- pass 0: broken syntax + structure ---------- */
    guard("structure", () => {
      if (opts.htmlValidation) {
        for (const token of tokens) {
          if (token.type === "comment" && token.unterminated) {
            addIssue("structure", "error", "HTML comment is never closed with --> — everything after it is hidden", snippet(token.value, 50), false, token);
          }
          if (token.type === "raw" && token.unclosedRaw) {
            addIssue("structure", "error", "<" + token.name + "> is never closed — the rest of the document is swallowed by it", "", false, token);
          }
          if ((token.type === "open" || token.type === "self" || token.type === "close") && token.unterminated) {
            addIssue("structure", "error", "Tag is missing its closing > (or has an unclosed quote)", snippet(token.value, 60), false, token);
          }
          if (token.type === "text" && token.value === "<") {
            const next = tokens[token.idx + 1];
            if (next && next.type === "text" && /^\s+\/?[a-z][a-z0-9]*[\s>\/]/i.test(next.value)) {
              addIssue("html-validity", "error", "Broken tag: space after \"<\" — browsers show it as text", snippet("<" + next.value, 60), false, token);
            } else {
              addIssue("html-validity", "warn", "Stray \"<\" in the content — write &lt;", "", false, token);
            }
          }
        }

        const structure = new Map();
        const note = view => (token, level, message, detail, rule) => {
          const key = (token ? token.idx : -1) + "|" + message;
          if (!structure.has(key)) structure.set(key, { token: token, level: level, message: message, detail: detail, rule: rule, views: new Set() });
          structure.get(key).views.add(view);
        };

        const views = buildViews(tokens, note("both"));
        validateStructure(views.web, note("web"));
        validateStructure(views.mso, note("mso"));
    checkTables(views.web, note("web"));
    checkTables(views.mso, note("mso"));

        for (const entry of structure.values()) {
          let suffix = "";
          if (hasConditionals && !entry.views.has("both") && entry.views.size === 1) {
            suffix = entry.views.has("mso") ? " (in the Outlook-only code)" : " (outside Outlook)";
          }
          addIssue(entry.rule || "structure", entry.level, entry.message + suffix, entry.detail, false, entry.token);
        }
      }
    });

    /* ---------- pass 1: tag level checks ---------- */
    const usedClasses = new Map();   // class -> count
    const classAttrs = [];           // every class attribute string
    const classTokens = [];          // tokens carrying a class attribute
    const elements = [];             // { tag, token, classes, inlineProps }
    const ids = new Map();           // id -> token
    const anchorNames = new Set();
    const anchorLinks = [];
    const webLinks = [];
    const msoVisible = new Set(buildViews(tokens, () => {}).mso);
    const currentYear = opts.currentYear || new Date().getFullYear();
    const mergeKinds = new Set();
    const mergeSeen = new Set();
    let usesBackgroundImage = false;
    let vmlNamespaced = false;

    const fix = (rule, fixMessage, openLevel, openMessage, detail, where, apply) => {
      if (opts.autofix) {
        apply();
        addIssue(rule, "fix", fixMessage, detail, true, where);
        return true;
      }
      addIssue(rule, openLevel, openMessage, detail, false, where);
      return false;
    };

    const noteMergeTags = (text, token) => {
      for (const m of MERGE_RES) {
        const found = String(text).match(m.re) || [];
        found.forEach(tag => {
          mergeKinds.add(m.kind);
          stats.mergeTags++;
          if (!mergeSeen.has(tag)) {
            mergeSeen.add(tag);
            addIssue("merge-tags", "info", "Merge tag / profile field used", tag, false, token);
          }
        });
      }
      const bad = mergeBalance(text);
      if (bad) addIssue("merge-tags", "error", "Unbalanced merge tag " + bad + " — an opening or closing delimiter is missing", snippet(text, 60), false, token);
    };

    /* Every special character in the email, for the characters panel:
       raw occurrences still in the HTML, raw ones the tool encoded, and
       ones already written as entities (&nbsp;, &#185; …). */
    const charMap = new Map();
    const charEntry = (cp, ch) => {
      if (!charMap.has(cp)) {
        charMap.set(cp, {
          char: ch || String.fromCodePoint(cp), cp: cp,
          left: 0, fixed: 0, entity: 0,
          leftWhere: { text: 0, attr: 0, css: 0, url: 0 },
          entityForms: new Map(),
          leftExamples: [], fixedExamples: [], entityExamples: [],
          leftTokens: new Set(), entityTokens: new Set()
        });
      }
      return charMap.get(cp);
    };
    const example = (list, token, text, at, length, where) => {
      if (list.length >= 4) return;
      const clean = t => t.replace(/\s+/g, " ");
      list.push({
        token: token,
        before: clean(text.slice(Math.max(0, at - 28), at)),
        match: text.slice(at, at + length),
        after: clean(text.slice(at + length, at + length + 28)),
        where: where
      });
    };
    const noteChar = (ch, cp, token, where, fixedNow, count, text, at) => {
      const entry = charEntry(cp, ch);
      const n = count || 1;
      if (fixedNow) {
        entry.fixed += n;
        if (text !== undefined) example(entry.fixedExamples, token, text, at, ch.length, where);
      } else {
        entry.left += n;
        entry.leftWhere[where] = (entry.leftWhere[where] || 0) + n;
        if (token) entry.leftTokens.add(token);
        if (text !== undefined) example(entry.leftExamples, token, text, at, ch.length, where);
      }
    };

    const REVERSE_ENTITY = new Map();
    ENTITY_BY_CODE.forEach((name, code) => REVERSE_ENTITY.set(name, code));

    /* characters already written as entities */
    const entityScan = (text, token, where) => {
      if (!opts.asciiCheck || String(text).indexOf("&") === -1) return;
      const re = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const body = m[1];
        let cp;
        if (body.charAt(0) === "#") {
          cp = body.charAt(1).toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
          if (CP1252[cp]) cp = CP1252[cp];
        } else {
          cp = REVERSE_ENTITY.get(body);
        }
        if (!cp || cp < 128 || cp > 0x10FFFF) continue;
        const entry = charEntry(cp);
        entry.entity++;
        entry.entityForms.set(m[0], (entry.entityForms.get(m[0]) || 0) + 1);
        if (token) entry.entityTokens.add(token);
        example(entry.entityExamples, token, text, m.index, m[0].length, where);
      }
    };

    /* Values written longer than needed. Returns true when it rewrote decls. */
    const simplifyDecls = (decls, label, where) => {
      if (!opts.cssValidation) return false;
      const fixing = opts.autofix && opts.shortenCss;
      let touched = false;
      const zeroExamples = [];

      decls.forEach(d => {
        if (d.bare) return;
        const prop = stripComments(d.prop).toLowerCase();
        const value = stripComments(d.value);
        if (!value || hasMergeTag(value)) return;

        if (BOX_PROPS.has(prop)) {
          const r = simplifyBox(value);
          if (!r) return;
          if (r.collapsed) {
            const before = prop + ": " + value;
            const after = prop + ": " + r.minimal;
            if (fixing) {
              d.value = r.minimal;
              touched = true;
              addIssue("css-shorthand", "fix", "Shortened " + before + " → " + after, label, true, where);
            } else {
              addIssue("css-shorthand", "warn", "\"" + before + "\" can be written \"" + after + "\"", label, false, where);
            }
            return;
          }
          if (fixing) { d.value = r.minimal; touched = true; }
          zeroExamples.push(prop + ": " + value);
          return;
        }

        const core = value.replace(/!\s*important\s*$/i, "").trim();
        if ((LENGTH_PROPS.has(prop) || prop === "line-height") && /^\S+$/.test(core) && isZeroValue(core) && core !== "0") {
          if (fixing) { d.value = "0" + (/!\s*important\s*$/i.test(value) ? " !important" : ""); touched = true; }
          zeroExamples.push(prop + ": " + value);
        }
      });

      zeroExamples.forEach(example => {
        if (fixing) addIssue("css-shorthand", "fix", "Removed the unit from zero values (0px → 0)", label + " — " + example, true, where);
        else addIssue("css-shorthand", "info", "Zero written with a unit (0px) — plain 0 is enough", label + " — " + example, false, where);
      });

      combinableSides(decls).forEach(c => {
        const names = c.base + "-top / right / bottom / left";
        if (fixing) {
          const first = decls.indexOf(c.sides[0]);
          const firstIndex = Math.min.apply(null, c.sides.map(d => decls.indexOf(d)));
          c.sides.forEach(d => { const k = decls.indexOf(d); if (k !== -1) decls.splice(k, 1); });
          decls.splice(Math.min(firstIndex, decls.length), 0, { prop: c.base, value: c.value, bare: false });
          touched = touched || first !== -1;
          addIssue("css-shorthand", "fix", "Combined " + names + " into " + c.base + ": " + c.value, label, true, where);
        } else {
          addIssue("css-shorthand", "info", names + " can be one shorthand: " + c.base + ": " + c.value, label, false, where);
        }
      });

      return touched;
    };

    /* ASCII checker for a piece of text. Returns the (possibly encoded) text. */
    const asciiScan = (text, token, where, canEncode) => {
      if (!opts.asciiCheck) return text;
      let out = "";
      let changed = false;
      let pos = 0;

      /* the words around a character, so the finding is easy to locate */
      const around = at => snippet(text.slice(Math.max(0, at - 30), at + 30).replace(/\s+/g, " "), 64);

      /* "$" and "~" are on the DARTmail list too: ESPs read them as
         merge-tag markers, so they are noted in visible text only. */
      if (where === "text") {
        const merged = stripMergeTags(text);
        ["$", "~"].forEach(ch => {
          const at = merged.indexOf(ch);
          if (at === -1) return;
          noteChar(ch, ch.charCodeAt(0), token, "text", false, merged.split(ch).length - 1, merged, at);
          addIssue("ascii", "info", "\"" + ch + "\" is on the ASCII checker list — encode it as " + entityFor(ch.charCodeAt(0)) + " if your ESP treats it as a merge-tag marker", snippet(merged.slice(Math.max(0, at - 30), at + 30), 64), false, token);
        });
      }

      for (const ch of text) {
        const cp = ch.codePointAt(0);
        const at = pos;
        pos += ch.length;

        if (cp < 128) { out += ch; continue; }

        stats.specialChars++;
        noteChar(ch, cp, token, where, canEncode && opts.encodeChars, 1, text, at);

        const entity = entityFor(cp);
        const invisible = INVISIBLE_CHARS[cp];
        const listed = ASCII_CHECK_SET.has(ch);

        if (canEncode && opts.encodeChars && where === "url") {
          const coded = encodeURIComponent(ch);
          out += coded;
          changed = true;
          addIssue("ascii", "fix", "Percent-encoded \"" + ch + "\" in a URL as " + coded, around(at), true, token);
          continue;
        }

        if (canEncode && opts.encodeChars) {
          out += entity;
          changed = true;
          addIssue("ascii", "fix", "Encoded " + (invisible ? invisible : "\"" + ch + "\"") + " as " + entity, around(at), true, token);
          continue;
        }

        out += ch;

        if (where === "url") {
          addIssue("links", "warn", "URL contains a non-ASCII character — percent-encode it", "\"" + ch + "\" (" + hexCode(cp) + ") in " + snippet(text, 60), false, token);
          continue;
        }

        const place = where === "css" ? " in CSS" : where === "attr" ? " in an attribute" : "";

        if (invisible) {
          addIssue("ascii", "warn", "Invisible character: " + invisible + " (" + hexCode(cp) + ")" + place + " — usually pasted from Word or Docs; use " + entity, around(at), false, token);
        } else {
          addIssue("ascii", "warn", "Special character \"" + ch + "\" (" + hexCode(cp) + ")" + place + " — encode it as " + entity,
            around(at) + (listed ? "" : "  ·  not on the DARTmail list, flagged as non-ASCII"), false, token);
        }
      }

      return changed ? out : text;
    };

    /* URL checks shared by href, src and background. */
    const checkUrl = (tag, attr, kind, token, label) => {
      const raw = attr.value;
      if (raw === null) return false;
      let changed = false;

      if (raw !== raw.trim() && raw.trim()) {
        changed = fix("links", "Removed spaces around a URL", "error", "URL has spaces at the start or end — clients may break the link", label + " — \"" + snippet(raw, 60) + "\"", token, () => { attr.value = raw.trim(); });
      }

      const v = raw.trim();
      if (!v) {
        if (kind === "src") addIssue("images", "error", "Image src is empty", label, false, token);
        return changed;
      }

      const plain = stripMergeTags(v);
      const lower = v.toLowerCase();

      if (/^javascript:/i.test(v)) { addIssue("links", "error", "javascript: URLs are stripped by every email client", label, false, token); return changed; }
      if (/^(https?:\/\/){2}/i.test(v)) addIssue("links", "error", "Protocol written twice in a URL", snippet(v, 80), false, token);
      else if (/^(htp|htps|htttps?|hhttps?|httpss|http:\/(?!\/)|https:\/(?!\/)|https?\/\/|https?;|https?:\\\\)/i.test(v)) {
        addIssue("links", "error", "Malformed URL protocol", snippet(v, 80), false, token);
      }
      if (/^www\./i.test(v)) addIssue("links", "error", "URL starts with www. — add https:// or clients treat it as a relative path", snippet(v, 80), false, token);

      const host = ((/^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i.exec(v) || [])[1] || "").toLowerCase();
      const group = kind === "href" ? "links" : "images";
      if (/^file:/i.test(v) || /^[a-z]:\\/i.test(v) || /^\/(users|home|var|tmp)\//i.test(v)) {
        addIssue(group, "error", "Points to a file on your computer — recipients can't open it", snippet(v, 80), false, token);
      } else if (host && !hasMergeTag(host)) {
        if (/^(localhost|0\.0\.0\.0|\[::1\]|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2})$/.test(host) ||
            /\.(local|localhost|test|invalid|internal|lan)$/.test(host)) {
          addIssue(group, "error", "Points to a local or internal server — recipients can't reach it", snippet(v, 80), false, token);
        } else if (/^(staging|stage|stg|dev|develop|test|testing|qa|uat|preprod|pre-prod|sandbox)[.-]/.test(host) ||
                   /[.-](staging|stage|stg|uat|preprod)\./.test(host)) {
          addIssue(group, "warn", "Looks like a staging or test server — switch to the live URL", host, false, token);
        } else if (/(^|\.)example\.(com|org|net)$/.test(host)) {
          addIssue(group, "warn", "Placeholder domain example.com — replace it with the real URL", snippet(v, 80), false, token);
        }
      }
      if (kind === "href" && /^https?:\/\//i.test(v) && !/unsubscribe|abmelden|opt-?out/i.test(v)) webLinks.push({ url: v, token: token });
      if (/\s/.test(plain.trim()) && !/^(mailto|tel|sms):/i.test(v)) addIssue("links", "error", "URL contains a space — encode it as %20", snippet(v, 80), false, token);

      if (/^http:\/\//i.test(v)) {
        if (kind === "href") stats.links.http++;
        addIssue(kind === "src" ? "images" : "links", "warn", "Uses http:// — switch to https:// (images get blocked and links flagged)", snippet(v, 80), false, token);
      } else if (/^https:\/\//i.test(v) && kind === "href") stats.links.https++;

      if (v.length > 255 && !/^data:/i.test(v)) {
        addIssue("links", "warn", "URL is longer than 255 characters — some trackers and clients truncate it", v.length + " characters: " + snippet(v, 60), false, token);
      }

      if (/^mailto:/i.test(v)) {
        const address = decodeURIComponentSafe(v.slice(7).split("?")[0]);
        const query = v.slice(7).split("?").slice(1).join("?");
        if (query && /\s/.test(stripMergeTags(query, "x"))) {
          addIssue("links", "warn", "mailto: subject or body has raw spaces — encode them as %20", snippet(v, 80), false, token);
        }
        if (!address.trim()) addIssue("links", "warn", "mailto: link has no email address", label, false, token);
        else if (!hasMergeTag(address) && address.split(",").some(a => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.trim()))) {
          addIssue("links", "warn", "mailto: address looks invalid", snippet(address, 60), false, token);
        }
      }
      if (/^tel:/i.test(v) && !hasMergeTag(v) && !/^tel:\+?[0-9().\-\s]+$/i.test(v)) {
        addIssue("links", "warn", "tel: number contains characters other than digits, +, -, ( )", snippet(v, 60), false, token);
      }

      if (kind === "src" || kind === "background") {
        const path = lower.split("?")[0].split("#")[0];
        if (/^data:/i.test(v)) addIssue("images", "warn", "Base64 data: images are blocked by Gmail and Outlook — host the image", label, false, token);
        else if (/\.svg$/.test(path)) addIssue("images", "warn", "SVG images don't display in Gmail or Outlook — use PNG or JPG", snippet(v, 60), false, token);
        else if (/\.webp$/.test(path)) addIssue("images", "warn", "WebP images don't display in Outlook for Windows — use PNG or JPG", snippet(v, 60), false, token);
        else if (/\.(bmp|tiff?|heic|avif)$/.test(path)) addIssue("images", "warn", "Image format is not supported by most email clients — use PNG, JPG or GIF", snippet(v, 60), false, token);
        if (isRelativeUrl(v)) addIssue("images", "warn", "Image path is relative — mail clients cannot resolve it, use a full https:// URL", "src=\"" + v + "\"", false, token);
      } else if (kind === "href") {
        if (isRelativeUrl(v) && !/^www\./i.test(v)) addIssue("links", "warn", "Link href is a relative path — use a full https:// URL", "href=\"" + v + "\"", false, token);
        if (v.charAt(0) === "#" && v.length > 1 && !hasMergeTag(v)) anchorLinks.push({ target: v.slice(1), token: token });
      }

      const urlFixed = asciiScan(v, token, "url", true);
      if (urlFixed !== v) {
        attr.value = attr.value.replace(v, urlFixed);
        changed = true;
      }
      return changed;
    };

    guard("tags", () => {
      for (const token of tokens) {
        /* closing tags: case, attributes, void closers */
        if (token.type === "close") {
          if (!opts.htmlValidation) continue;
          if (/^<\s*\/\s*[a-zA-Z0-9:_.-]+\s+[^\s>]/.test(token.value)) {
            addIssue("html-validity", "warn", "Closing tag has attributes — browsers ignore them", snippet(token.value), false, token);
          }
          if (token.name === "br") {
            addIssue("html-validity", "error", "</br> is invalid — browsers turn it into an extra line break; use <br>", "", false, token);
          } else if (VOID_TAGS.has(token.name)) {
            fix("html-validity", "Removed </" + token.name + "> — void elements have no closing tag", "warn", "</" + token.name + "> is not needed — <" + token.name + "> has no closing tag", "", token, () => { token.removed = true; });
          } else if (/[A-Z]/.test(token.value.slice(0, token.name.length + 3)) && token.name.indexOf(":") === -1) {
            fix("html-validity", "Lowercased upper-case tag names", "info", "Upper-case tag names — lowercase is the convention", token.value, token, () => {
              token.value = token.value.replace(/^<\s*\/\s*[a-zA-Z0-9_.-]+/, m => m.toLowerCase());
            });
          }
          continue;
        }

        if (token.type !== "open" && token.type !== "self") continue;

        const tag = parseTag(token.value);
        if (!tag) continue;

        let changed = false;
        const label = snippet(token.value, 70);
        const isNamespaced = /:/.test(tag.lower);

        /* --- inventory --- */
        stats.tags++;
        if (tag.lower === "table") stats.tables++;
        if (tag.lower === "img") stats.images++;
        if (tag.lower.indexOf("v:") === 0 && getAttr(tag, "xmlns:v")) vmlNamespaced = true;
        if (tag.lower === "html" && getAttr(tag, "xmlns:v")) vmlNamespaced = true;

        if (tag.lower === "a") {
          const hrefAttr = getAttr(tag, "href");
          const raw = hrefAttr && hrefAttr.value !== null ? hrefAttr.value.trim() : null;
          const links = stats.links;

          links.total++;

          if (raw === null) { links.missing++; links.notLinked++; }
          else if (raw === "") { links.empty++; links.notLinked++; }
          else if (raw === "#") { links.placeholder++; links.notLinked++; }
          else if (/^mailto:/i.test(raw)) { links.mailto++; links.linked++; }
          else if (/^(tel|sms|callto):/i.test(raw)) { links.tel++; links.linked++; }
          else if (raw.charAt(0) === "#") { links.anchor++; links.notLinked++; }
          else if (/^(https?:)?\/\//i.test(raw)) { links.linked++; }
          else if (/[{}%$\[\]<>|]/.test(raw)) { links.mergeTag++; links.linked++; }
          else { links.relative++; links.notLinked++; }
        }

        /* --- raw tag syntax --- */
        if (opts.htmlValidation) {
          if (!token.unterminated && /<\s*[a-zA-Z]/.test(token.value.slice(1).replace(/"[^"]*"|'[^']*'/g, ""))) {
            addIssue("html-validity", "error", "Tag is missing its closing > — the next tag was swallowed into it", label, false, token);
          }
          if (/=\s*("[^"]*"|'[^']*')[^\s\/>]/.test(token.value)) {
            changed = fix("html-validity", "Added the missing space between attributes", "warn", "Missing space between attributes", label, token, () => {}) || changed;
          }
          if (tag.attrs.some(a => a.value !== null && /[<>]/.test(a.value) && !hasMergeTag(a.value) && a.name.toLowerCase() !== "content")) {
            addIssue("html-validity", "error", "Attribute value contains < or > — probably a missing closing quote", label, false, token);
          }
          if (token.explicitSelf && !VOID_TAGS.has(tag.lower) && !isNamespaced && KNOWN_TAGS.has(tag.lower)) {
            addIssue("html-validity", "error", "<" + tag.lower + " /> is not self-closing in HTML — the element stays open; write <" + tag.lower + "></" + tag.lower + ">", label, false, token);
          }

          if (!isNamespaced && (/[A-Z]/.test(tag.name) || tag.attrs.some(a => a.name.indexOf(":") === -1 && /[A-Z]/.test(a.name)))) {
            changed = fix("html-validity", "Lowercased upper-case tag names", "info", "Upper-case tag or attribute names — lowercase is the convention", label, token, () => {
              tag.name = tag.name.toLowerCase();
              tag.attrs.forEach(a => { if (a.name.indexOf(":") === -1) a.name = a.name.toLowerCase(); });
            }) || changed;
          }

          if (!isNamespaced && !KNOWN_TAGS.has(tag.lower)) {
            const guess = suggest(tag.lower, KNOWN_TAGS);
            if (guess) addIssue("html-validity", "error", "Unknown tag <" + tag.lower + "> — did you mean <" + guess + ">?", label, false, token);
            else addIssue("html-validity", "warn", "Unknown tag <" + tag.lower + ">", label, false, token);
          }

          if (EMAIL_UNSUPPORTED[tag.lower]) {
            const [level, message] = EMAIL_UNSUPPORTED[tag.lower];
            addIssue("support", level, message, label, false, token);
          }
          if (tag.lower === "link" && /stylesheet/i.test(attrValue(tag, "rel") || "")) {
            if (/fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|use\.fontawesome/i.test(attrValue(tag, "href") || "")) {
            addIssue("support", "info", "Web font stylesheet — only some clients (Apple Mail, iOS) load it; keep fallbacks in font-family", label, false, token);
          } else {
            addIssue("support", "warn", "External stylesheets are stripped by Gmail and most clients — embed or inline the CSS", label, false, token);
          }
          }
          if (tag.lower === "meta" && /refresh/i.test(attrValue(tag, "http-equiv") || "")) {
            addIssue("support", "error", "<meta http-equiv=\"refresh\"> is stripped and looks like spam", label, false, token);
          }
        }

        /* --- duplicate attributes --- */
        const seen = new Map();

        for (let k = 0; k < tag.attrs.length; k++) {
          const lower = tag.attrs[k].name.toLowerCase();
          if (!seen.has(lower)) { seen.set(lower, k); continue; }

          const first = tag.attrs[seen.get(lower)];
          const dupe = tag.attrs[k];

          if (opts.autofix) {
            tag.attrs.splice(k, 1);
            k--;
            changed = true;
            addIssue("attributes", "fix", "Removed duplicate " + lower + " attribute — the first one wins in every client", '<' + tag.lower + '> kept "' + first.value + '", dropped "' + dupe.value + '"', true, token);
          } else {
            addIssue("attributes", "error", "Duplicate " + lower + " attribute on <" + tag.lower + ">", 'kept "' + first.value + '" / dropped "' + dupe.value + '"', false, token);
          }
        }

        /* --- every empty attribute --- */
        if (opts.emptyAttrs) {
          for (let k = tag.attrs.length - 1; k >= 0; k--) {
            const a = tag.attrs[k];
            const lower = a.name.toLowerCase();
            if (a.value === null || a.value.trim() !== "") continue;

            if (lower === "alt") {
              addIssue("empty-attr", "info", 'alt="" kept — correct for a spacer or decorative image', "<" + tag.lower + "> — " + label, false, token);
              continue;
            }

            if (lower === "href" || lower === "src") continue;

            if (KEEP_EMPTY.has(lower) || /^(data|aria)-/.test(lower) || lower.indexOf(":") !== -1) {
              addIssue("empty-attr", "warn", 'Empty ' + lower + '="" kept — check whether it should carry a value', "<" + tag.lower + "> — " + label, false, token);
              continue;
            }

            if (opts.autofix) {
              tag.attrs.splice(k, 1);
              changed = true;
              addIssue("empty-attr", "fix", 'Removed empty ' + lower + '=""', "<" + tag.lower + "> — " + label, true, token);
            } else {
              addIssue("empty-attr", "warn", 'Empty ' + lower + '="" found', "<" + tag.lower + "> — " + label, false, token);
            }
          }
        }

        /* --- attribute names and values --- */
        if (opts.htmlValidation && !isNamespaced) {
          for (const a of tag.attrs) {
            const lower = a.name.toLowerCase();
            const value = a.value;
            const v = value === null ? "" : value.trim();

            if (/^on[a-z]+$/.test(lower)) {
              addIssue("support", "error", "Event handler attributes (on…) are stripped by every email client", lower + " on <" + tag.lower + ">", false, token);
              continue;
            }

            if (lower.indexOf(":") === -1 && !/^(data|aria)-/.test(lower) && !KNOWN_ATTRS.has(lower) && !ESP_ATTRS.has(lower)) {
              if (!/^[a-z][a-z0-9_.-]*$/i.test(lower)) {
                addIssue("attributes", "error", "Malformed attribute name \"" + snippet(a.name, 30) + "\" — check the quotes around it", label, false, token);
                continue;
              }
              const guess = suggest(lower, KNOWN_ATTRS);
              if (guess) addIssue("attributes", "error", "Unknown attribute \"" + lower + "\" — did you mean \"" + guess + "\"?", "<" + tag.lower + "> — " + label, false, token);
              else addIssue("attributes", "info", "Non-standard attribute \"" + lower + "\" — fine if your ESP or editor uses it", "<" + tag.lower + "> — " + label, false, token);
              continue;
            }

            const only = ATTR_ONLY_ON[lower];
            if (only && KNOWN_TAGS.has(tag.lower) && !only.has(tag.lower)) {
              addIssue("attributes", "warn", lower + " has no effect on <" + tag.lower + ">", label, false, token);
            }

            if (value === null || !v || hasMergeTag(v)) continue;

            if (lower === "align") {
              const allowed = ALIGN_VALUES[tag.lower] || (ALIGN_BLOCK_TAGS.has(tag.lower) ? ALIGN_VALUES.block : null);
              const val = v.toLowerCase();
              if (allowed && !allowed.has(val)) {
                let hint = "";
                if (val === "centre") hint = " — did you mean \"center\"?";
                else if (setOf("top middle bottom").has(val)) hint = " — vertical alignment goes in valign";
                addIssue("attributes", "error", "align=\"" + v + "\" is not valid on <" + tag.lower + ">" + hint, label, false, token);
              }
            }

            if (lower === "valign" && !setOf("top middle bottom baseline").has(v.toLowerCase())) {
              addIssue("attributes", "error", "valign=\"" + v + "\" is not valid — use top, middle or bottom", label, false, token);
            }

            if (COLOR_ATTRS.has(lower) && (tag.lower !== "font" || lower === "color")) {
              const val = v.toLowerCase();
              if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(val) || NAMED_COLORS.has(val)) {
                /* fine */
              } else if (/^([0-9a-f]{6}|[0-9a-f]{3})$/.test(val)) {
                changed = fix("attributes", "Added the missing # to a colour attribute", "warn", lower + "=\"" + v + "\" is missing its #", label, token, () => { a.value = "#" + v; }) || changed;
              } else {
                addIssue("attributes", "error", "Invalid colour " + lower + "=\"" + v + "\"", label, false, token);
              }
            }

            if ((lower === "width" || lower === "height") && !/^(meta|script|link)$/.test(tag.lower)) {
              if (/^\d+(\.\d+)?px$/i.test(v)) {
                changed = fix("attributes", "Removed \"px\" from a " + lower + " attribute — attributes take plain numbers", "error", lower + "=\"" + v + "\" — attributes take plain numbers, not px", label, token, () => { a.value = v.replace(/px$/i, ""); }) || changed;
              } else if (!/^\d+(\.\d+)?%?$/.test(v)) {
                addIssue("attributes", "error", lower + "=\"" + v + "\" is not a valid size — use a number or a percentage", label, false, token);
              }
            }

            if (INT_ATTRS.has(lower)) {
              if (/^\d+px$/i.test(v)) {
                changed = fix("attributes", "Removed \"px\" from a " + lower + " attribute — attributes take plain numbers", "error", lower + "=\"" + v + "\" — attributes take plain numbers, not px", label, token, () => { a.value = v.replace(/px$/i, ""); }) || changed;
              } else if (!/^\d+$/.test(v)) {
                addIssue("attributes", "error", lower + "=\"" + v + "\" must be a whole number", label, false, token);
              }
            }

            if ((lower === "colspan" || lower === "rowspan") && !/^[1-9]\d*$/.test(v) && !(lower === "rowspan" && v === "0")) {
              addIssue("attributes", "error", lower + "=\"" + v + "\" must be a positive whole number", label, false, token);
            }

            if (lower === "target" && /^(blank|self|parent|top)$/i.test(v)) {
              addIssue("attributes", "warn", "target=\"" + v + "\" opens a named window — did you mean \"_" + v.toLowerCase() + "\"?", label, false, token);
            }

            if (lower === "dir" && !setOf("ltr rtl auto").has(v.toLowerCase())) {
              addIssue("attributes", "error", "dir=\"" + v + "\" is not valid — use ltr, rtl or auto", label, false, token);
            }

            if (lower === "lang" && !/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(v)) {
              addIssue("attributes", "warn", "lang=\"" + v + "\" is not a valid language code (e.g. en, en-GB)", label, false, token);
            }

            if (lower === "id") {
              if (/\s/.test(v)) addIssue("attributes", "error", "id contains spaces", "id=\"" + v + "\"", false, token);
              if (ids.has(v)) addIssue("attributes", "error", "Duplicate id \"" + v + "\" — ids must be unique", label, false, token);
              else ids.set(v, token);
            }
          }
        } else if (!isNamespaced) {
          const idValue = attrValue(tag, "id");
          if (idValue) ids.set(idValue.trim(), token);
        }

        if (tag.lower === "a" && attrValue(tag, "name")) anchorNames.add(attrValue(tag, "name").trim());

        /* --- duplicate properties inside a style attribute --- */
        if (opts.duplicateProps) {
          const styleAttr = getAttr(tag, "style");

          if (styleAttr && styleAttr.value) {
            const parsed = parseStyleAttr(styleAttr.value);
            const result = dedupeDecls(parsed);

            result.dropped.forEach(entry => {
              if (opts.autofix) {
                addIssue("duplicate-prop", "fix", 'Removed duplicate "' + entry.prop + '" from a style attribute', "<" + tag.lower + '> kept "' + entry.winner + '", dropped "' + entry.value + '"', true, token);
              } else {
                addIssue("duplicate-prop", "error", 'Property "' + entry.prop + '" is declared twice in a style attribute', "<" + tag.lower + '> "' + entry.winner + '" vs "' + entry.value + '"', false, token);
              }
            });

            if (result.dropped.length && opts.autofix) {
              styleAttr.value = serializeStyleAttr(result.list);
              changed = true;
            }
          }
        }

        /* --- inline CSS validity --- */
        const inlineStyle = getAttr(tag, "style");
        if (inlineStyle && inlineStyle.value && inlineStyle.value.trim() && opts.cssValidation && !isNamespaced) {
          const decls = parseStyleAttr(inlineStyle.value);
          const ctx = {
            label: "<" + tag.lower + "> style",
            support: opts.bestPractice,
            onBackground: () => { usesBackgroundImage = true; }
          };
          decls.forEach(d => checkDeclaration(d, ctx, (rule, level, message, detail) => addIssue(rule, level, message, detail, false, token)));
          shorthandShadows(decls).forEach(s => {
            addIssue("redundant", "warn", "Longhand overridden by a later shorthand in the same style — dead code", s.longhand + "  →  overridden by  " + s.shorthand, false, token);
          });

          if (simplifyDecls(decls, "<" + tag.lower + ">", token)) {
            inlineStyle.value = serializeStyleAttr(decls);
            changed = true;
          }

          /* CSS that has no effect where it is written */
          const css = styleMap(inlineStyle.value);
          const margins = Object.keys(css).filter(k => /^margin(-(top|right|bottom|left))?$/.test(k));
          if (margins.length && setOf("td th tr").has(tag.lower)) {
            const allZero = margins.every(k => css[k].replace(/!\s*important/i, "").trim().split(/\s+/).every(isZeroValue));
            if (allZero) {
              addIssue("redundant", "info", "margin on <" + tag.lower + "> does nothing — remove it", margins.map(k => k + ": " + css[k]).join("; "), false, token);
            } else {
              addIssue("redundant", "warn", "margin has no effect on <" + tag.lower + "> — use padding instead", margins.map(k => k + ": " + css[k]).join("; "), false, token);
            }
          }
          if (tag.lower === "tr" && Object.keys(css).some(k => /^padding/.test(k))) {
            addIssue("redundant", "warn", "padding has no effect on <tr> — put it on the <td>", "", false, token);
          }
          if (opts.bestPractice && tag.lower === "table" && !getAttr(tag, "align")) {
            const centred = /\bauto\b/i.test(css.margin || "") || (/auto/i.test(css["margin-left"] || "") && /auto/i.test(css["margin-right"] || ""));
            if (centred) {
              addIssue("support", "warn", "Outlook for Windows ignores margin:auto — add align=\"center\" to centre this table", label, false, token);
            }
          }
        }

        /* --- links and images --- */
        for (const a of tag.attrs) {
          const lower = a.name.toLowerCase();
          if (lower === "href" && (tag.lower === "a" || tag.lower === "area" || isNamespaced)) {
            if (checkUrl(tag, a, "href", token, label)) changed = true;
          } else if (lower === "src" && (tag.lower === "img" || isNamespaced)) {
            if (checkUrl(tag, a, "src", token, label)) changed = true;
          } else if (lower === "background" && a.value && a.value.trim()) {
            usesBackgroundImage = true;
            if (checkUrl(tag, a, "background", token, label)) changed = true;
          }
        }

        if (tag.lower === "a") {
          const href = getAttr(tag, "href");

          if (href && href.value !== null) {
            const value = href.value.trim();
            if (value === "" || value === "#") {
              addIssue("links", "warn", 'Link has href="' + value + '" — placeholder, left untouched', label, false, token);
            }
          } else if (!href && !getAttr(tag, "name") && !getAttr(tag, "id")) {
            addIssue("links", "warn", "Link has no href attribute", label, false, token);
          }
        }

        if (opts.bestPractice && tag.lower === "img") {
          const alt = getAttr(tag, "alt");
          if (!alt) {
            addIssue("images", "warn", "Image has no alt attribute — add real alt text, or alt=\"\" if it is decorative", label, false, token);
          } else if (alt.value && alt.value.trim()) {
            const text = alt.value.trim().toLowerCase();
            if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(text) || GENERIC_ALT.has(text) || /^(img|image|dsc|screenshot)[_\- ]?\d+$/.test(text)) {
              addIssue("images", "warn", "Alt text looks like a file name or placeholder — describe the image", "alt=\"" + alt.value + "\"", false, token);
            }
          }

          if (!getAttr(tag, "width")) {
            addIssue("images", "warn", "Image has no width attribute — Outlook shows it at the file's full size", label, false, token);
          }

          const imgStyle = parseStyleAttr((getAttr(tag, "style") || {}).value || "");

          if (!imgStyle.some(d => d.prop.toLowerCase() === "display")) {
            addIssue("images", "warn", "Image style has no display — Outlook and Gmail can leave a gap under it. display:block is the usual fix", label, false, token);
          }
        }

        if (opts.bestPractice && !isNamespaced && inlineStyle && inlineStyle.value) {
        const css = styleMap(inlineStyle.value);
        if (/^none\b/i.test(css.display || "") && !/^all\b/i.test(css["mso-hide"] || "") && msoVisible.has(token)) {
          addIssue("support", "info", "Hidden with display:none but no mso-hide:all — Outlook for Windows may still show it", label, false, token);
        }
      }

      /* placeholder copy in alt / title */
      if (opts.bestPractice) {
        ["alt", "title"].forEach(name => {
          const value = attrValue(tag, name);
          const found = value && findPlaceholder(value);
          if (found) addIssue("content", "warn", "Placeholder text left in the email", name + "=\"" + found + "\"", false, token);
        });
      }

      if (opts.bestPractice && tag.lower === "meta" && EDITOR_META.has(String(attrValue(tag, "name") || "").toLowerCase())) {
          addIssue("redundant", "info", "Editor-generated <meta> — not needed in an email", label, false, token);
        }

        /* --- ASCII + merge tags in attribute values --- */
        for (const a of tag.attrs) {
          if (a.value === null) continue;
          const lower = a.name.toLowerCase();
          if (lower === "style") { asciiScan(a.value, token, "css", false); continue; }
          if (lower === "href" || lower === "src" || lower === "background" || lower === "class" || lower === "id") {
            if (lower !== "class" && lower !== "id") noteMergeTags(a.value, token);
            continue;
          }
          noteMergeTags(a.value, token);
          entityScan(a.value, token, "attr");
          const encoded = asciiScan(a.value, token, "attr", lower.indexOf(":") === -1 && lower !== "content");
          if (encoded !== a.value) { a.value = encoded; changed = true; }
        }

        /* --- double spaces inside class values --- */
        const classCheck = getAttr(tag, "class");

        if (classCheck && classCheck.value && /\s{2,}/.test(classCheck.value.trim())) {
          if (opts.autofix) {
            classCheck.value = classCheck.value.trim().replace(/\s+/g, " ");
            changed = true;
            addIssue("spacing", "fix", "Collapsed extra spaces inside a class attribute", "<" + tag.lower + '> class="' + classCheck.value + '"', true, token);
          } else {
            addIssue("spacing", "warn", "Extra spaces inside a class attribute", "<" + tag.lower + "> — " + label, false, token);
          }
        }

        /* --- table attributes --- */
        if (opts.tableAttrs && tag.lower === "table") {
          const required = [["cellpadding", "0"], ["cellspacing", "0"], ["role", "presentation"]];
          if (opts.requireBorder) required.unshift(["border", "0"]);

          for (const [name, expected] of required) {
            const attr = getAttr(tag, name);

            if (!attr || attr.value === null || attr.value.trim() === "") {
              if (opts.autofix) {
                insertAttrBeforeStyle(tag, name, expected);
                changed = true;
                addIssue("table-attrs", "fix", 'Added ' + name + '="' + expected + '" to <table>', label, true, token);
              } else {
                addIssue("table-attrs", "warn", 'Missing ' + name + '="' + expected + '" on <table>', label, false, token);
              }
            } else if (attr.value.trim().toLowerCase() !== expected) {
              addIssue(
                "table-attrs",
                "warn",
                name + '="' + attr.value + '" is not "' + expected + '" — left as is, check it is intentional',
                label,
                false,
                token
              );
            }
          }
        }

        /* --- width / height attribute vs style --- */
        const dims = [];
        if (opts.widthSync) dims.push("width");
        if (opts.heightSync) dims.push("height");

        if (dims.length && !isNamespaced) {
          for (const dim of dims) {
            const attr = getAttr(tag, dim);
            if (!attr || attr.value === null || attr.value.trim() === "") continue;

            const wanted = normalizeLength(attr.value);
            if (!wanted) continue;

            const styleAttr = getAttr(tag, "style");
            const decls = parseStyleAttr(styleAttr ? styleAttr.value : "");
            const decl = styleLength(decls, dim);

            if (!decl) {
              if (opts.autofix) {
                decls.push({ prop: dim, value: wanted, bare: false });
                if (styleAttr) styleAttr.value = serializeStyleAttr(decls);
                else setAttr(tag, "style", serializeStyleAttr(decls));
                changed = true;
                addIssue("dimension-sync", "fix", 'Added ' + dim + ":" + wanted + " to style (matches " + dim + '="' + attr.value + '")', "<" + tag.lower + "> — " + label, true, token);
              } else {
                addIssue("dimension-sync", "warn", dim + '="' + attr.value + '" has no matching ' + dim + " in style", "<" + tag.lower + "> — " + label, false, token);
              }
              continue;
            }

            const important = /!important/i.test(decl.value);
            const current = normalizeLength(decl.value.replace(/!important/i, "").trim());

            if (current === wanted) continue;
            if (!current) continue; /* auto, calc(), max-content … are deliberate */

            const fluid = current.endsWith("%") !== wanted.endsWith("%");

            /* Which value is right is a judgement call: report it, and only
               rewrite the style when "Force px/% width fixes" is switched on. */
            if (opts.autofix && opts.forceWidthFix) {
              const before = decl.value;
              decl.value = wanted + (important ? " !important" : "");
              const styleRef = getAttr(tag, "style");
              styleRef.value = serializeStyleAttr(decls);
              changed = true;
              addIssue("dimension-sync", "fix", dim + " mismatch fixed: style " + dim + ":" + before + " → " + decl.value + ' (attribute ' + dim + '="' + attr.value + '" wins)', "<" + tag.lower + "> — " + label, true, token);
            } else {
              addIssue(
                "dimension-sync",
                fluid ? "warn" : "error",
                fluid
                  ? dim + " attribute and style differ (px vs %) — fluid pattern? Outlook uses the attribute, other clients the style"
                  : dim + " attribute and style disagree — Outlook uses the attribute, other clients the style",
                dim + '="' + attr.value + '" vs style ' + dim + ":" + decl.value + "  ·  <" + tag.lower + "> — " + label,
                false,
                token
              );
            }
          }
        }

        if (changed) token.value = serializeTag(tag);

        const classAttr = getAttr(tag, "class");
        if (classAttr && classAttr.value) {
          classTokens.push(token);
          classAttrs.push(classAttr.value);
          for (const cls of classAttr.value.split(/\s+/).filter(Boolean)) {
            usedClasses.set(cls, (usedClasses.get(cls) || 0) + 1);
          }
        }

        const styleNow = getAttr(tag, "style");
        elements.push({
          tag: tag.lower,
          token: token,
          classes: classAttr && classAttr.value ? classAttr.value.split(/\s+/).filter(Boolean) : [],
          inline: new Set(parseStyleAttr(styleNow ? styleNow.value : "").filter(d => !d.bare).map(d => d.prop.toLowerCase()))
        });
      }
    });

    for (const token of tokens) if (token.type === "cond-open") stats.conditionals++;

    /* in-page anchors */
    guard("anchors", () => {
      if (opts.bestPractice) {
        anchorLinks.forEach(link => {
          if (!ids.has(link.target) && !anchorNames.has(link.target)) {
            addIssue("links", "warn", "In-page link #" + link.target + " has no element with that id or name", "", false, link.token);
          }
        });
      }
    });

    /* ---------- pass 1b: element content (links, empty tags, wrappers) ---------- */
    guard("element content", () => {
      if (opts.bestPractice || opts.htmlValidation) {
        const open = [];
        let brRun = [];

        const cssOf = frame => {
          if (!frame.css) frame.css = frame.tag ? styleMap(attrValue(frame.tag, "style")) : {};
          return frame.css;
        };

        /* text colour against the background it actually sits on */
        const checkContrast = token => {
          const visible = stripMergeTags(token.value, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/[\u00a0\u200b-\u200d\u034f]/g, " ");
          if (!/[A-Za-z0-9\u00C0-\uFFFF]/.test(visible)) return;

          let fg = null;
          let bg = null;
          let size = null;
          let bold = false;

          for (let k = open.length - 1; k >= 0; k--) {
            const f = open[k];
            if (!f.tag) continue;
            const css = cssOf(f);

            if (/^none/i.test(css.display || "") || /^all/i.test(css["mso-hide"] || "") ||
                /^0(\.0+)?$/.test(String(css.opacity || "").trim()) || /^hidden/i.test(css.visibility || "") ||
                (/^0(px)?$/i.test(String(css["max-height"] || "").trim()) && /hidden/i.test(css.overflow || ""))) return;

            if (!size && css["font-size"]) {
              const fs = /^([\d.]+)(px|pt)?/i.exec(css["font-size"]);
              if (fs) {
                size = Number(fs[1]) * (String(fs[2]).toLowerCase() === "pt" ? 4 / 3 : 1);
                if (size <= 1) return;
              }
            }
            if (/bold|[6-9]00/i.test(css["font-weight"] || "") || f.tag.lower === "strong" || f.tag.lower === "b") bold = true;

            if (!fg) {
              const c = css.color || (f.tag.lower === "font" ? attrValue(f.tag, "color") : null);
              if (c) {
                fg = parseColor(c);
                if (!fg) return;
              } else if (f.tag.lower === "a") {
                return; /* link colour is up to the client */
              }
            }

            if (!bg && /^v:/.test(f.tag.lower)) {
              /* Outlook VML shapes paint their own fill */
              const fill = attrValue(f.tag, "fillcolor");
              if (!fill) return;
              bg = parseColor(fill);
              if (!bg) return;
            }

            if (!bg) {
              const shorthand = css.background && !/url\(/i.test(css.background) ? css.background.trim().split(/\s+/)[0] : null;
              const c = css["background-color"] || shorthand || attrValue(f.tag, "bgcolor");
              if (c && !/^(transparent|inherit|initial|none)$/i.test(String(c).trim())) {
                bg = parseColor(c);
                if (!bg) return;
              } else if (css["background-image"] || /url\(/i.test(css.background || "") || attrValue(f.tag, "background")) {
                return; /* text over an image: can't judge */
              }
            }
          }

          if (!fg) return;
          if (!bg) bg = [255, 255, 255];

          const ratio = contrastRatio(fg, bg);
          const large = size && (size >= 24 || (size >= 18.66 && bold));
          const pair = colorHex(fg) + " on " + colorHex(bg) + " (" + ratio.toFixed(2) + ":1)";

          if (ratio < 3) {
            addIssue("accessibility", "warn", "Low text contrast " + pair + " — hard to read; aim for at least 4.5:1", snippet(visible, 60), false, token);
          } else if (!large && ratio < 4.5) {
            addIssue("accessibility", "info", "Text contrast " + pair + " is below the 4.5:1 WCAG AA guideline", snippet(visible, 60), false, token);
          }
        };

        const flushBr = () => {
          if (brRun.length >= 3 && opts.bestPractice) {
            addIssue("redundant", "info", brRun.length + " <br> in a row used for spacing — use padding or a spacer row", "", false, brRun[0]);
          }
          brRun = [];
        };

        tokens.forEach((token, index) => {
          if (token.removed) return;

          if (token.type === "self" && token.name === "br") { brRun.push(token); return; }
          if (token.type === "text" && !token.value.trim()) return;
          flushBr();

          if (token.type === "open" && token.name !== undefined) {
            const tag = parseTag(token.value);

            /* max-width layouts need an Outlook ghost table or a width */
            if (opts.bestPractice && !hasConditionals && tag && (tag.lower === "div" || tag.lower === "table")) {
              const css = styleMap(attrValue(tag, "style"));
              const fixedAttr = /^\d+$/.test(String(attrValue(tag, "width") || "").trim());
              const fixedStyle = /^\d+(\.\d+)?px/i.test(css.width || "");
              const insideFixed = open.some(f => f.tag && setOf("td th table").has(f.tag.lower) && /^\d+$/.test(String(attrValue(f.tag, "width") || "").trim()));
              if (/^\d+(\.\d+)?px/i.test(css["max-width"] || "") && !fixedAttr && !fixedStyle && !insideFixed) {
                addIssue("support", "warn", "Outlook for Windows ignores max-width — this block stretches to full width; add a ghost table or a width attribute", snippet(token.value), false, token);
              }
            }

            open.push({ token: token, tag: tag, text: "", collect: token.name === "a", images: 0, labelled: false, index: index });
            return;
          }

          if (token.type === "self" && token.name === "img") {
            const tag = parseTag(token.value);
            const alt = attrValue(tag, "alt");
            const imgWidth = Number(attrValue(tag, "width"));
            if (opts.bestPractice && imgWidth && /^\d+$/.test(String(attrValue(tag, "width")).trim())) {
              for (let k = open.length - 1; k >= 0; k--) {
                const f = open[k];
                if (!f.tag || !setOf("td th table").has(f.tag.lower)) continue;
                const box = String(attrValue(f.tag, "width") || "").trim();
                if (!/^\d+$/.test(box)) break;
                if (imgWidth > Number(box)) {
                  addIssue("images", "warn", "Image is wider than the cell or table that holds it", "img width=\"" + imgWidth + "\" inside <" + f.tag.lower + " width=\"" + box + "\">", false, token);
                }
                break;
              }
            }
            open.forEach(f => { if (f.collect) { f.images++; if (alt && alt.trim()) f.labelled = true; } });
            return;
          }

          if (token.type === "text") {
            open.forEach(f => { if (f.collect && f.text.length < 200) f.text += token.value; });
            if (opts.bestPractice) checkContrast(token);
            return;
          }

          if (token.type === "self" && token.name.indexOf(":") !== -1) {
            open.forEach(f => { if (f.collect) f.labelled = true; });
            return;
          }

          if (token.type !== "close") return;

          let k = open.length - 1;
          while (k >= 0 && open[k].token.name !== token.name) k--;
          if (k === -1) return;

          const frame = open[k];
          open.length = k;
          const name = token.name;
          const text = frame.text.replace(/&nbsp;|&#160;|\u00a0/gi, " ").trim();
          const attrCount = frame.tag ? frame.tag.attrs.length : 0;

          if (name === "a" && opts.bestPractice) {
            const tag = frame.tag;
            const named = tag && (attrValue(tag, "aria-label") || attrValue(tag, "title"));
            if (!text && !frame.labelled && !named && attrValue(tag, "href") !== null) {
              addIssue("accessibility", "warn", "Link has no text and no image alt — screen readers announce it as just \"link\"", snippet(frame.token.value), false, frame.token);
            } else if (GENERIC_LINK_TEXT.has(text.toLowerCase().replace(/[.!…]+$/, ""))) {
              addIssue("accessibility", "info", "Link text \"" + text + "\" says nothing out of context — describe the destination", "", false, frame.token);
            }
          }

          const adjacent = index === frame.index + 1 || (index === frame.index + 2 && tokens[frame.index + 1].type === "text" && !tokens[frame.index + 1].value.trim());
          if (!adjacent || !opts.bestPractice) return;

          if (setOf("span font b strong em i u small big sup sub s strike").has(name) && !attrCount) {
            fix("redundant", "Removed an empty <" + name + "></" + name + ">", "warn", "Empty <" + name + "></" + name + "> does nothing", "", frame.token, () => {
              frame.token.removed = true;
              token.removed = true;
              for (let m = frame.index + 1; m < index; m++) tokens[m].removed = true;
            });
          } else if (setOf("p div h1 h2 h3 h4 h5 h6 center").has(name)) {
            addIssue("redundant", "warn", "Empty <" + name + "> — adds unpredictable spacing; use padding instead", snippet(frame.token.value), false, frame.token);
          }
        });
        flushBr();

        /* attribute-less <span>/<font> wrappers do nothing */
        if (opts.bestPractice) {
          const stack = [];
          tokens.forEach(token => {
            if (token.removed) return;
            if (token.type === "open" && (token.name === "span" || token.name === "font")) {
              const tag = parseTag(token.value);
              stack.push({ token: token, bare: !tag.attrs.length });
            } else if (token.type === "close" && (token.name === "span" || token.name === "font")) {
              const frame = stack.pop();
              if (frame && frame.token.name === token.name && frame.bare) {
                fix("redundant", "Removed a <" + token.name + "> wrapper that had no attributes", "info", "<" + token.name + "> with no attributes does nothing — remove the wrapper", "", frame.token, () => {
                  frame.token.removed = true;
                  token.removed = true;
                });
              }
            }
          });
        }
      }
    });

    /* ---------- pass 2: text content ---------- */
    guard("text", () => {
      for (const token of tokens) {
        if (token.type === "comment") {
          stats.comments++;
          if (opts.bestPractice && !token.unterminated) {
            const body = token.value.replace(/^<!--|-->$/g, "");
            if (/<\/?[a-z][^>]*>/i.test(body)) {
              addIssue("redundant", "info", "Commented-out code — remove it before sending", snippet(body, 60), false, token);
            } else if (body.trim()) {
              addIssue("redundant", "info", "HTML comment — visible in the source and adds weight", snippet(body, 60), false, token);
            }
          }
          continue;
        }

        if (token.type !== "text" || token.removed) continue;

        const text = token.value;
        if (!text.trim()) continue;

        noteMergeTags(text, token);

        /* entities */
        if (opts.htmlValidation) {
          const re = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*)(;?)/gi;
          let m;
          let rewritten = text;

          while ((m = re.exec(text)) !== null) {
            const body = m[1];
            const closed = m[2] === ";";

            if (body.charAt(0) === "#") {
              const cp = body.charAt(1).toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
              if (!closed) {
                addIssue("html-validity", "warn", "Numeric entity &" + body + " is missing its ;", snippet(text, 50), false, token);
              } else if (CP1252[cp]) {
                const right = entityFor(CP1252[cp]);
                fix("ascii", "Replaced Windows-1252 entity &" + body + "; with " + right, "warn", "&" + body + "; is a Windows-1252 code, not Unicode — use " + right, snippet(text, 50), token, () => {
                  rewritten = rewritten.split("&" + body + ";").join(right);
                });
              } else if (cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
                addIssue("html-validity", "error", "Invalid numeric entity &" + body + ";", snippet(text, 50), false, token);
              }
              continue;
            }

            if (closed) {
              if (KNOWN_ENTITIES.has(body)) continue;
              const guess = suggest(body, KNOWN_ENTITIES);
              if (guess) addIssue("html-validity", "error", "Unknown entity &" + body + "; — did you mean &" + guess + ";?", snippet(text, 50), false, token);
              else addIssue("html-validity", "info", "Entity &" + body + "; is HTML5-only — older clients may show it literally", snippet(text, 50), false, token);
            } else if (KNOWN_ENTITIES.has(body)) {
              fix("html-validity", "Added the missing ; to &" + body, "warn", "Entity &" + body + " is missing its ;", snippet(text, 50), token, () => {
                rewritten = rewritten.replace(new RegExp("&" + body + "(?![a-z0-9;])", "g"), "&" + body + ";");
              });
            }
          }

          if (rewritten !== text) token.value = rewritten;
        }

        /* ASCII checker on visible text */
        entityScan(token.value, token, "text");
      token.value = asciiScan(token.value, token, "text", true);

        /* double spaces between words in visible content */
        const match = /(\S[^\S\n]{2,}\S)/.exec(text);
        if (match) {
          const at = Math.max(0, match.index - 25);
          const snip = text.slice(at, match.index + match[0].length + 25).replace(/\n/g, " ").trim();
          addIssue("spacing", opts.autofix ? "fix" : "warn", opts.autofix ? "Collapsed a double space in the text content" : "Double space in the text content", snip, opts.autofix, token);
        }

        if (opts.bestPractice) {
          const plain = stripMergeTags(text, "Name");
          const repeat = /\b([A-Za-z]{2,})\s+\1\b/i.exec(plain);
          if (repeat && repeat[1].toLowerCase() !== "that" && repeat[1].toLowerCase() !== "had") {
            addIssue("content", "warn", "Repeated word \"" + repeat[1] + " " + repeat[1] + "\"", snippet(plain.slice(Math.max(0, repeat.index - 20), repeat.index + 40), 60), false, token);
          }
          if (/[A-Za-z0-9)]\s+[,.](\s|$)/.test(plain) && !/\.\s*\./.test(plain)) {
            addIssue("content", "info", "Space before a comma or full stop", snippet(plain, 60), false, token);
          }
          const placeholder = findPlaceholder(text);
          if (placeholder) addIssue("content", "warn", "Placeholder text left in the email", placeholder, false, token);

          const copyright = /(?:©|&copy;|&#169;|\(c\)|copyright)\s*(?:[^0-9<]{0,25}?)((?:19|20)\d{2})(?:\s*(?:-|–|&ndash;|—|&mdash;)\s*((?:19|20)\d{2}))?/i.exec(text);
          if (copyright) {
            const year = Number(copyright[2] || copyright[1]);
            if (year < currentYear) addIssue("content", "info", "Copyright year " + year + " is out of date — it's " + currentYear + " now", snippet(copyright[0], 60), false, token);
          }

          if (/(&nbsp;\s*){3,}/i.test(text)) {
            addIssue("redundant", "info", "Several &nbsp; in a row used for spacing — use padding instead", snippet(text, 50), false, token);
          }
        }
      }
    });

    if (mergeKinds.size > 1) {
      addIssue("merge-tags", "warn", "Merge tags in more than one syntax (" + Array.from(mergeKinds).join("  ") + ") — check they all belong to your ESP", "", false);
    }

    /* Commented-out markup still counts as usage — never delete its CSS. */
    guard("commented classes", () => {
      for (const token of tokens) {
        if (token.type !== "comment") continue;
        const re = /class\s*=\s*("([^"]*)"|'([^']*)')/gi;
        let m;
        while ((m = re.exec(token.value)) !== null) {
          const value = m[2] !== undefined ? m[2] : m[3] || "";
          classAttrs.push(value);
          const list = value.split(/\s+/).filter(Boolean);
          for (const cls of list) usedClasses.set(cls, (usedClasses.get(cls) || 0) + 1);
        }
      }
    });

    /* ---------- pass 3: CSS ---------- */
    const cssTokens = tokens.filter(t => t.type === "raw" && t.name === "style");
    const cssErrors = cssTokens.map(() => []);
    const cssTrees = cssTokens.map((t, i) => parseCss(t.value, cssErrors[i]));
    const definedClasses = new Set();
    const definedPredicates = [];
    const cssText = cssTokens.map(t => t.value).join("\n");

    const walkRules = (nodes, fn, parentAt) => {
      for (let k = 0; k < nodes.length; k++) {
        const node = nodes[k];
        if (node.type === "rule") fn(node, nodes, parentAt || null);
        else if (node.type === "at") walkRules(node.children, fn, node);
      }
    };

    for (const tree of cssTrees) {
      walkRules(tree, rule => {
        for (const cls of collectSelectorClasses(rule.selector)) definedClasses.add(cls);
        classPredicates(rule.selector).forEach(p => definedPredicates.push(p));
      });
    }

    /* Does any CSS rule reach this class? */
    const classIsStyled = cls => definedClasses.has(cls) || definedPredicates.some(p => {
      if (p.value === null) return true;
      if (p.op === "=") return words(p.value).indexOf(cls) !== -1;
      return predicateMatches(p, cls);
    });

    guard("ascii css", () => {
      cssTokens.forEach(styleToken => asciiScan(styleToken.value, styleToken, "css", false));
    });

    /* --- stylesheet syntax and values --- */
    guard("css syntax", () => {
      if (opts.cssValidation) {
        cssTokens.forEach((styleToken, ti) => {
          cssErrors[ti].forEach(err => {
            const message = {
              unclosed: "CSS block is missing its closing }",
              stray: "Extra } in <style> — the rules after it may be dropped",
              orphan: "Text in <style> outside any rule — probably a broken selector or missing {",
              comment: "CSS comment is never closed with */"
            }[err.kind];
            addIssue("css", "error", message, snippet(err.text, 60), false, { styleToken: styleToken });
          });

          const visit = (nodes) => {
            for (let k = nodes.length - 1; k >= 0; k--) {
              const node = nodes[k];
              const where = { node: node, styleToken: styleToken };

              if (node.type === "statement") {
                if (/^@import/i.test(node.text) && opts.bestPractice) addIssue("support", "warn", "@import is stripped by Gmail and most clients — embed the CSS instead", snippet(node.text, 60), false, where);
                continue;
              }

              if (node.type === "at") {
                if (/^@media/i.test(node.prelude)) {
                  if (/\band\(/i.test(node.prelude)) addIssue("css", "error", "@media query needs a space after \"and\" — the whole block is ignored", node.prelude, false, where);
                  if (/\((max|min)-(device-)?(width|height)\s*:\s*\d+(\.\d+)?\s*\)/i.test(node.prelude)) addIssue("css", "error", "@media width has no unit — the whole block is ignored (add px)", node.prelude, false, where);
                  if (/device-width/i.test(node.prelude)) addIssue("css", "info", "max-device-width is deprecated — max-width is more reliable", node.prelude, false, where);
                }
                if (/^@font-face/i.test(node.prelude) && opts.bestPractice) addIssue("support", "info", "Web fonts only load in some clients (Apple Mail, iOS) — keep fallbacks in font-family", "", false, where);
                visit(node.children);
                continue;
              }

              if (node.type !== "rule") continue;

              if (/^@font-face/i.test(node.selector)) {
                if (opts.bestPractice) addIssue("support", "info", "Web fonts only load in some clients (Apple Mail, iOS) — keep fallbacks in font-family", "", false, where);
                continue;
              }
              if (/^@/.test(node.selector)) continue;

              const selector = node.selector;
              if (!selector) addIssue("css", "error", "CSS rule has no selector", declsText(node.decls), false, where);
              else {
                const parts = selector.split(",").map(s => s.trim());
                if (parts.some(p => !p)) addIssue("css", "error", "Empty selector in a selector list (stray comma)", selector, false, where);
                if (/\.\.|\.\s|#\s|\.\d/.test(selector.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, ""))) addIssue("css", "error", "Malformed selector", selector, false, where);
              }

              if (!node.decls.length) {
                fix("redundant", "Removed an empty CSS rule", "warn", "Empty CSS rule — remove it", selector + " {}", where, () => { nodes.splice(k, 1); });
                continue;
              }

              const ctx = {
                label: selector,
                support: opts.bestPractice,
                onBackground: () => { usesBackgroundImage = true; }
              };
              node.decls.forEach(d => checkDeclaration(d, ctx, (rule, level, message, detail) => addIssue(rule, level, message, detail, false, where)));
              shorthandShadows(node.decls).forEach(s => {
                addIssue("redundant", "warn", "Longhand overridden by a later shorthand in the same rule — dead code", selector + ": " + s.longhand + "  →  " + s.shorthand, false, where);
              });
              simplifyDecls(node.decls, selector, where);
            }
          };

          visit(cssTrees[ti]);
        });
      }
    });

    /* --- duplicate properties inside stylesheet rules --- */
    guard("duplicate properties", () => {
      if (opts.duplicateProps) {
        cssTrees.forEach((tree, treeIndex) => {
          walkRules(tree, rule => {
            const result = dedupeDecls(rule.decls);
            if (!result.dropped.length) return;

            const where = { node: rule, styleToken: cssTokens[treeIndex] };

            result.dropped.forEach(entry => {
              if (opts.autofix) {
                addIssue("duplicate-prop", "fix", 'Removed duplicate "' + entry.prop + '" from ' + rule.selector, 'kept "' + entry.winner + '", dropped "' + entry.value + '"', true, where);
              } else {
                addIssue("duplicate-prop", "error", 'Property "' + entry.prop + '" is declared twice in ' + rule.selector, '"' + entry.winner + '" vs "' + entry.value + '"', false, where);
              }
            });

            if (opts.autofix) rule.decls = result.list;
          });
        });
      }
    });

    /* --- unused classes --- */
    guard("unused classes", () => {
      if (opts.unusedClasses) {
        const unusedInCss = new Map();
        const keptClientClasses = new Set();

        const partIsUsed = part => {
          const classes = collectSelectorClasses(part);
          if (classes.some(isProtectedClass)) {
            classes.filter(isProtectedClass).forEach(c => keptClientClasses.add(c));
            return { used: true };
          }
          const dead = classes.filter(c => !usedClasses.has(c));
          const preds = classPredicates(part);
          const deadPred = preds.find(p => !classAttrs.some(s => predicateMatches(p, s)));
          if (dead.length) return { used: false, names: dead.map(c => "." + c) };
          /* [class="fluid"] on class="fluid g-img": the author meant it, the selector is wrong */
          if (deadPred && deadPred.op === "=" && deadPred.value &&
              classAttrs.some(s => words(deadPred.value).every(w => words(s).indexOf(w) !== -1))) {
            return { used: true, exact: deadPred.value };
          }
          if (deadPred) return { used: false, names: ["[class" + deadPred.op + (deadPred.value === null ? "" : "\"" + deadPred.value + "\"") + "]"] };
          return { used: true };
        };

        cssTrees.forEach((tree, ti) => {
          const prune = nodes => {
            for (let k = nodes.length - 1; k >= 0; k--) {
              const node = nodes[k];

              if (node.type === "at") { prune(node.children); continue; }
              if (node.type !== "rule" || /^@/.test(node.selector)) continue;

              const parts = safeSplit(node.selector, ",");
              const keep = [];

              for (const part of parts) {
                const verdict = partIsUsed(part);
                if (verdict.exact) {
                  addIssue("css", "error",
                    "[class=\"" + verdict.exact + "\"] never matches — the element also has other classes; use [class~=\"" + verdict.exact + "\"] or ." + words(verdict.exact)[0],
                    part.trim(), false, { node: node, styleToken: cssTokens[ti] });
                }
                if (verdict.used) { keep.push(part); continue; }
                verdict.names.forEach(n => { if (!unusedInCss.has(n)) unusedInCss.set(n, { node: node, styleToken: cssTokens[ti] }); });
                if (!opts.autofix) keep.push(part);
              }

              if (opts.autofix && keep.length === 0) nodes.splice(k, 1);
              else if (opts.autofix && keep.length !== parts.length) node.selector = keep.join(", ");
            }
          };
          prune(tree);
        });

        if (keptClientClasses.size) {
          addIssue(
            "unused-class",
            "info",
            "Kept " + keptClientClasses.size + " email-client class" + (keptClientClasses.size === 1 ? "" : "es") + " that the client adds at render time",
            Array.from(keptClientClasses).map(c => "." + c).join(", "),
            false
          );
        }

        for (const [name, where] of unusedInCss) {
          addIssue(
            "unused-class",
            opts.autofix ? "fix" : "warn",
            (opts.autofix ? "Removed CSS rule for " : "CSS selector ") + name + (opts.autofix ? " — not used anywhere in the HTML" : " is never used in the HTML"),
            "",
            opts.autofix,
            where
          );
        }

        if (!cssTrees.length && classTokens.length) {
          addIssue(
            "unused-class",
            "info",
            "No <style> block in this HTML, so classes on tags were left alone",
            "Rules may live in an external or parent template",
            false
          );
        }

        for (const token of (cssTrees.length ? classTokens : [])) {
          const tag = parseTag(token.value);
          if (!tag) continue;

          const classAttr = getAttr(tag, "class");
          if (!classAttr || !classAttr.value) continue;

          const list = classAttr.value.split(/\s+/).filter(Boolean);
          const keep = list.filter(c => classIsStyled(c) || isProtectedClass(c));
          const dropped = list.filter(c => !classIsStyled(c) && !isProtectedClass(c));

          if (!dropped.length) continue;

          dropped.forEach(c => {
            addIssue(
              "unused-class",
              opts.autofix ? "fix" : "warn",
              (opts.autofix ? 'Removed class="' : 'Class "') + c + '" — no matching CSS rule',
              "<" + tag.lower + ">",
              opts.autofix,
              token
            );
          });

          if (!opts.autofix) continue;

          if (keep.length) classAttr.value = keep.join(" ");
          else tag.attrs.splice(tag.attrs.indexOf(classAttr), 1);

          token.value = serializeTag(tag);
        }

        /* id selectors that match nothing */
        cssTrees.forEach((tree, ti) => {
          walkRules(tree, rule => {
            for (const id of collectSelectorIds(rule.selector)) {
              if (!ids.has(id) && !isProtectedId(id)) {
                addIssue("unused-class", "warn", "CSS selector #" + id + " matches no element id", rule.selector, false, { node: rule, styleToken: cssTokens[ti] });
              }
            }
          });
        });
      }
    });

    /* --- duplicate selectors outside @media --- */
    guard("duplicate selectors", () => {
      if (opts.cssValidation) {
        const seenSel = new Map();
        cssTrees.forEach((tree, ti) => {
          tree.forEach(node => {
            if (node.type !== "rule" || /^@/.test(node.selector)) return;
            const key = normalizeSelector(node.selector);
            if (seenSel.has(key)) {
              addIssue("redundant", "warn", "Selector defined more than once — merge the rules", key, false, { node: node, styleToken: cssTokens[ti] });
            } else seenSel.set(key, node);
          });
        });
      }
    });

    /* --- media queries --- */
    const mediaBlocks = [];

    cssTrees.forEach((tree, treeIndex) => {
      tree.forEach(node => {
        if (node.type === "at" && /^@media/i.test(node.prelude)) {
          mediaBlocks.push({ block: node, styleToken: cssTokens[treeIndex] });
        }
      });
    });

    stats.mediaBlocks = mediaBlocks.length;

    const groups = new Map();
    mediaBlocks.forEach(entry => {
      const key = normalizeMedia(entry.block.prelude);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    });
    stats.breakpoints = groups.size;

    guard("media blocks", () => {
      if (opts.mediaSync && mediaBlocks.length) {
        for (const group of groups.values()) {
          if (group.length < 2) continue;
          group.slice(1).forEach(entry => {
            addIssue(
              "media-sync",
              "warn",
              "Two or more @media blocks share the condition " + shortCondition(entry.block.prelude) + " — merge them into one",
              entry.block.prelude,
              false,
              { node: entry.block, styleToken: entry.styleToken }
            );
          });
        }
      }
    });

    guard("breakpoints", () => {
      if (opts.crossMedia && groups.size > 1) {
        addIssue(
          "cross-media",
          "info",
          groups.size + " breakpoints found — checked for rules that override each other",
          Array.from(groups.values()).map(g => shortCondition(g[0].block.prelude)).join("   |   "),
          false
        );
      }
    });

    /* Every declaration in source order, with where it applies. A later
       declaration for the same selector + property that applies whenever
       the earlier one does (and wins the cascade) makes the earlier dead. */
    guard("media overrides", () => {
      if ((opts.mediaSync || opts.crossMedia) && mediaBlocks.length) {
        const entries = [];
        let order = 0;

        cssTrees.forEach((tree, ti) => {
          const visit = (nodes, media) => {
            nodes.forEach(node => {
              if (node.type === "at") {
                if (/^@media/i.test(node.prelude)) visit(node.children, node);
                return;
              }
              if (node.type !== "rule" || /^@/.test(node.selector)) return;
              const sel = normalizeSelector(node.selector);
              const finals = new Map();
              node.decls.forEach(d => { if (!d.bare) finals.set(d.prop.toLowerCase(), d); });
              finals.forEach((d, prop) => {
                entries.push({
                  sel: sel,
                  prop: prop,
                  value: d.value,
                  important: /!important/i.test(d.value),
                  media: media,
                  cond: media ? normalizeMedia(media.prelude) : null,
                  range: media ? mediaRange(media.prelude) : { min: 0, max: Infinity },
                  node: node,
                  styleToken: cssTokens[ti],
                  order: order++
                });
              });
            });
          };
          visit(tree, null);
        });

        const byKey = new Map();
        entries.forEach(e => {
          const key = e.sel + "||" + e.prop;
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(e);
        });

        const reported = new Set();

        byKey.forEach(list => {
          for (let i = 0; i < list.length; i++) {
            const a = list[i];
            if (!a.media) continue;

            for (let j = i + 1; j < list.length; j++) {
              const b = list[j];
              if (a.important && !b.important) continue;

              const sameCond = b.cond !== null && b.cond === a.cond;
              const always = !b.media;
              const covers = !always && !sameCond && a.range && b.range && b.range.min <= a.range.min && b.range.max >= a.range.max;

              if (!sameCond && !always && !covers) continue;
              if (sameCond && !opts.mediaSync) continue;
              if (!sameCond && !opts.crossMedia) continue;

              const key = a.order;
              if (reported.has(key)) break;
              reported.add(key);

              const where = { node: a.node, styleToken: a.styleToken };
              const detail = a.sel + " { " + a.prop + ": " + a.value + " }   is overridden by   " +
                (b.media ? shortCondition(b.media.prelude) + " " : "") + "{ " + b.prop + ": " + b.value + " }";

              if (a.value === b.value) {
                addIssue(sameCond ? "media-sync" : "cross-media", "warn",
                  "Same value repeated in a later rule — the earlier one is redundant", detail, false, where);
              } else if (sameCond) {
                addIssue("media-sync", "error",
                  "Conflicting values in two " + shortCondition(a.media.prelude) + " blocks — the later one wins, so this one never applies",
                  detail, false, where);
              } else if (always) {
                addIssue("cross-media", "error",
                  "A rule after this @media block overrides it at every width — move the @media block after it, or add !important",
                  detail, false, where);
              } else {
                addIssue("cross-media", "error",
                  "Breakpoint order: a later, wider @media block overrides this one, so it never applies — put narrower breakpoints last",
                  detail, false, where);
              }
              break;
            }
          }
        });
      }
    });

    /* --- @media rules that cannot beat inline styles --- */
    guard("inline overrides", () => {
      if (opts.cssValidation && mediaBlocks.length) {
        const byClass = new Map();
        elements.forEach(el => el.classes.forEach(c => {
          if (!byClass.has(c)) byClass.set(c, []);
          byClass.get(c).push(el);
        }));

        const related = prop => {
          const out = [prop];
          Object.keys(SHORTHANDS).forEach(sh => {
            if (sh === prop) SHORTHANDS[sh].forEach(p => out.push(p));
            if (SHORTHANDS[sh].has(prop)) out.push(sh);
          });
          return out;
        };

        mediaBlocks.forEach(entry => {
          walkRules(entry.block.children, rule => {
            for (const part of safeSplit(rule.selector, ",")) {
              const compound = part.trim().split(/\s*[\s>+~]\s*/).pop() || "";
              if (/:/.test(compound)) continue;
              const classes = collectSelectorClasses(compound);
              if (!classes.length) continue;
              const tagMatch = /^([a-z][a-z0-9]*)/i.exec(compound);
              const tagName = tagMatch ? tagMatch[1].toLowerCase() : null;
              const candidates = (byClass.get(classes[0]) || []).filter(el =>
                classes.every(c => el.classes.indexOf(c) !== -1) && (!tagName || el.tag === tagName));

              rule.decls.forEach(d => {
                if (d.bare || /!important/i.test(d.value)) return;
                const prop = d.prop.toLowerCase();
                const hit = candidates.find(el => related(prop).some(p => el.inline.has(p)));
                if (hit) {
                  addIssue("cross-media", "warn",
                    "@media rule can't override an inline style without !important",
                    part.trim() + " { " + d.prop + ": " + d.value + " } vs inline style on <" + hit.tag + ">",
                    false, { node: rule, styleToken: entry.styleToken });
                }
              });
            }
          });
        });
      }
    });

    /* ---------- pass 4: document setup ---------- */
    const firstReal = tokens.find(t => !(t.type === "text" && !t.value.trim()));
    const findOpen = name => tokens.find(t => (t.type === "open" || t.type === "self") && t.name === name);
    const htmlToken = findOpen("html");
    const headToken = findOpen("head");
    const bodyToken = findOpen("body");
    const doctype = tokens.find(t => t.type === "doctype");
    const metas = tokens.filter(t => t.type === "self" && t.name === "meta").map(t => parseTag(t.value));
    const metaWith = (attr, re) => metas.some(m => re.test(String(attrValue(m, attr) || "")));
    const fragment = !htmlToken && !headToken && !bodyToken;

    guard("document", () => {
      if (fragment) {
        if (opts.htmlValidation) addIssue("document", "info", "No <html>, <head> or <body> — treated as a fragment, document checks skipped", "", false, firstReal);
      } else if (opts.htmlValidation) {
        const anchor = headToken || htmlToken || firstReal;

        if (!doctype) addIssue("document", "warn", "No <!DOCTYPE> — clients fall back to quirks mode and render spacing differently", "", false, firstReal);
        else if (firstReal !== doctype) addIssue("document", "warn", "<!DOCTYPE> must be the very first thing in the file", "", false, doctype);

        if (!htmlToken) addIssue("document", "error", "Missing <html> tag", "", false, firstReal);
        if (!headToken) addIssue("document", "error", "Missing <head> tag", "", false, htmlToken || firstReal);
        if (!bodyToken) addIssue("document", "error", "Missing <body> tag", "", false, htmlToken || firstReal);

        if (!metas.some(m => getAttr(m, "charset")) && !metaWith("content", /charset\s*=/i)) {
          addIssue("document", "warn", "No <meta charset> — special characters may display as garbage", "Add <meta charset=\"utf-8\"> or the http-equiv Content-Type tag", false, anchor);
        }
        const declared = metas.map(m => attrValue(m, "charset") || ((/charset\s*=\s*([\w-]+)/i.exec(attrValue(m, "content") || "") || [])[1])).find(Boolean);
        if (declared && !/^utf-?8$/i.test(declared.trim()) && stats.specialChars) {
          addIssue("document", "warn", "Declared charset is " + declared + " but the email has raw special characters — use utf-8 or encode them", stats.specialChars + " raw special characters", false, anchor);
        }
        if (!metaWith("name", /^viewport$/i)) {
          addIssue("document", "warn", "No viewport <meta> — mobile clients render at desktop width and @media rules may not apply", "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">", false, anchor);
        }

        const titleToken = findOpen("title");
        if (!titleToken) addIssue("document", "warn", "No <title> — some clients and the browser view show it", "", false, anchor);
        else {
          const next = tokens[titleToken.idx + 1];
          if (!next || next.type !== "text" || !next.value.trim()) addIssue("document", "warn", "<title> is empty", "", false, titleToken);
        }

        if (htmlToken) {
          const htmlTag = parseTag(htmlToken.value);
          if (!getAttr(htmlTag, "lang")) addIssue("accessibility", "warn", "No lang on <html> — screen readers may read the email in the wrong language", "", false, htmlToken);
        }
      }
    });

    guard("document extras", () => {
      if (!fragment && opts.bestPractice) {
        const anchor = headToken || htmlToken || firstReal;
        const hasVml = tokens.some(t => (t.type === "open" || t.type === "self") && /^v:/.test(t.name));

        if (!metaWith("name", /^x-apple-disable-message-reformatting$/i)) {
          addIssue("document", "info", "No x-apple-disable-message-reformatting <meta> — Apple Mail may rescale the layout", "", false, anchor);
        }
        if (/prefers-color-scheme/i.test(cssText) && !metaWith("name", /^(color-scheme|supported-color-schemes)$/i)) {
          addIssue("document", "warn", "Dark-mode CSS without <meta name=\"color-scheme\"> — Apple Mail ignores the dark styles", "", false, anchor);
        }
        if (hasVml && !vmlNamespaced) {
          addIssue("document", "warn", "VML is used but xmlns:v=\"urn:schemas-microsoft-com:vml\" is never declared", "Add it to <html> or to each v: element", false, htmlToken || anchor);
        }
        if (hasVml && !/o:OfficeDocumentSettings/i.test(src)) {
          addIssue("document", "info", "VML without the <o:OfficeDocumentSettings> DPI block — Outlook at 120 DPI may scale it", "", false, anchor);
        }
        if (usesBackgroundImage && !hasVml) {
          addIssue("support", "info", "Background image without a VML fallback — Outlook for Windows will not show it", "", false, anchor);
        }

        const words = tokens
          .filter(t => t.type === "text" && !t.removed)
          .map(t => stripMergeTags(t.value, " Name ").replace(/&[a-z0-9#]+;/gi, " "))
          .join(" ")
          .split(/\s+/)
          .filter(w => /[A-Za-z0-9\u00C0-\uFFFF]/.test(w)).length;
        if (stats.images && words < 50) {
          addIssue("document", "info", "Very little text (" + words + " words) next to " + plural(stats.images, "image") + " — with images blocked the email looks empty, and spam filters dislike image-only mail", "", false, bodyToken || anchor);
        }

        const tracked = webLinks.filter(l => /[?&]utm_[a-z]+=/i.test(l.url));
        if (tracked.length && tracked.length < webLinks.length) {
          webLinks.filter(l => !/[?&]utm_[a-z]+=/i.test(l.url)).forEach(l => {
            addIssue("links", "info", "Link has no UTM parameters while other links do", snippet(l.url, 80), false, l.token);
          });
        }
        const campaigns = new Set(tracked.map(l => ((/[?&]utm_campaign=([^&#]*)/i.exec(l.url) || [])[1] || "").toLowerCase()).filter(Boolean));
        if (campaigns.size > 1) {
          addIssue("links", "warn", "Links use different utm_campaign values — check they belong to this email", Array.from(campaigns).join(", "), false, tracked[0].token);
        }

        const bodyText = src.toLowerCase();
        if (!/unsubscribe|opt[\s-]?out|\*\|unsub|%%unsub|\{\{\s*unsubscribe|abmelden|se d[ée]sabonner|desuscrib/.test(bodyText)) {
          addIssue("document", "info", "No unsubscribe link found — required for marketing email (fine for transactional)", "", false, bodyToken || anchor);
        }

        const preheader = /style\s*=\s*("[^"]*(display\s*:\s*none|mso-hide\s*:\s*all)[^"]*"|'[^']*(display\s*:\s*none|mso-hide\s*:\s*all)[^']*')/i.test(src) ||
          /class\s*=\s*["'][^"']*pre-?header/i.test(src);
        if (!preheader) addIssue("document", "info", "No hidden preheader text found — inboxes will preview the first words of the body", "", false, bodyToken || anchor);
      }
    });

    /* ---------- format ---------- */
    let html;
    try {
      if (opts.failCheck === "format") throw new Error("test failure");
      html = render(tokens, cssTokens, cssTrees, opts);
    } catch (error) {
      addIssue("internal", "error", "Formatting failed — the output below is your input, unformatted", String(error && error.message || error), false);
      if (typeof console !== "undefined" && console.error) console.error("EmailTool format failed:", error);
      html = src;
    }
    const outLines = html.split("\n");
    stats.lines = outLines.length;

    /* SMTP limits a line to 998 characters; longer lines get broken by
       mail servers, often in the middle of a tag or URL. */
    guard("line length", () => {
      if (opts.htmlValidation) {
        outLines.forEach((row, index) => {
          if (row.length > 998) {
            addIssue("document", "warn", "Line longer than 998 characters — mail servers break it, sometimes inside a tag or URL", row.length + " characters", false, { line: index + 1 });
          }
        });
        const longInput = src.split("\n").map((row, i) => [i + 1, row.length]).filter(p => p[1] > 998);
        if (longInput.length && !outLines.some(r => r.length > 998)) {
          addIssue("document", "info", "Your pasted input has lines over 998 characters — the formatted output fixes this, so send the output",
            "Input line" + (longInput.length > 1 ? "s " : " ") + longInput.slice(0, 8).map(p => p[0]).join(", ") + (longInput.length > 8 ? "…" : ""), false);
        }
      }
    });

    /* Line numbers refer to the formatted output the person is reading. */
    issues.forEach(issue => {
      const at = issue.at;
      issue.at = null;
      if (!at) return;

      if (at.line) { issue.line = at.line; return; }

      if (at.srcLine !== undefined) {
        if (at.outLine) issue.line = at.outLine;
        return;
      }

      if (at.styleToken) {
        if (at.node && at.node.outLine !== undefined && at.styleToken.outBase !== undefined) {
          issue.line = at.styleToken.outBase + at.node.outLine + 1;
        } else if (at.styleToken.outLine) {
          issue.line = at.styleToken.outLine;
        }
      }
    });

    stats.errors = issues.filter(i => i.level === "error").length;

    const linesOf = tokens => {
      const lines = new Set();
      tokens.forEach(t => { if (t.outLine) lines.add(t.outLine); });
      return Array.from(lines).sort((a, b) => a - b);
    };
    const exampleOut = e => ({
      line: e.token && e.token.outLine ? e.token.outLine : 0,
      before: e.before,
      match: e.match,
      after: e.after,
      where: e.where
    });
    const STATUS_RANK = { needs: 0, optional: 1, fixed: 2, ok: 3 };

    const characters = Array.from(charMap.values()).map(c => {
      const named = ENTITY_BY_CODE.get(c.cp);
      const ascii = c.cp < 128;
      const status = c.left ? (ascii ? "optional" : "needs") : c.fixed ? "fixed" : "ok";
      const hex = c.cp.toString(16).toUpperCase();

      return {
        char: c.char,
        cp: c.cp,
        name: charName(c.cp),
        short: INVISIBLE_SHORT[c.cp] || null,
        unicode: hexCode(c.cp),
        status: status,
        total: c.left + c.fixed + c.entity,
        left: c.left,
        fixed: c.fixed,
        entity: c.entity,
        leftWhere: c.leftWhere,
        entityForms: Array.from(c.entityForms.entries()).map(([form, count]) => ({ form: form, count: count })),
        codes: {
          html: named ? "&" + named + ";" : "&#" + c.cp + ";",
          named: named ? "&" + named + ";" : null,
          decimal: "&#" + c.cp + ";",
          hex: "&#x" + hex + ";",
          css: "\\" + hex.padStart(6, "0"),
          url: encodeURIComponent(c.char)
        },
        listed: ASCII_CHECK_SET.has(c.char),
        invisible: !!INVISIBLE_CHARS[c.cp],
        ascii: ascii,
        lines: linesOf(c.leftTokens),
        entityLines: linesOf(c.entityTokens),
        examples: c.leftExamples.map(exampleOut),
        fixedExamples: c.fixedExamples.map(exampleOut),
        entityExamples: c.entityExamples.map(exampleOut)
      };
    }).sort((a, b) =>
      (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
      (b.invisible - a.invisible) ||
      (b.left - a.left) || (b.total - a.total) || (a.cp - b.cp));

    return { html: html, issues: issues, stats: stats, characters: characters };
  }

  function decodeURIComponentSafe(text) {
    try { return decodeURIComponent(text); } catch (error) { return text; }
  }

  /* ================================================================== */
  /* Renderer                                                            */
  /* ================================================================== */

  function render(tokens, cssTokens, cssTrees, opts) {
    const indentUnit = opts.indent;
    const lines = [];
    const stack = [];
    let level = 0;
    let inline = "";
    let pending = [];

    const pad = () => indentUnit.repeat(level);
    const top = () => (stack.length ? stack[stack.length - 1] : null);

    /* With expandConditionals on (the default) every conditional comment
       gets its own lines, which is how Outlook VML blocks are normally
       read. Off, a conditional wrapping only inline content stays inline. */
    const inlineCond = new Array(tokens.length).fill(false);
    (function markConditionals() {
      if (opts.expandConditionals) return;
      const open = [];
      tokens.forEach((token, index) => {
        if (token.type === "cond-open") { open.push({ index: index, inline: true }); return; }

        if (token.type === "cond-close") {
          const start = open.pop();
          if (!start) return;
          inlineCond[start.index] = start.inline;
          inlineCond[index] = start.inline;
          return;
        }

        if (!open.length) return;

        const blocky =
          (token.type === "open" || token.type === "close" || token.type === "self") &&
          !INLINE_TAGS.has(token.name);

        if (blocky || token.type === "comment" || token.type === "raw") {
          open.forEach(entry => { entry.inline = false; });
        }
      });
    })();

    function flushInline() {
      const text = inline.replace(/[ \t]+/g, " ").trim();
      const carried = pending;
      inline = "";
      pending = [];

      if (!text) {
        carried.forEach(token => { token.outLine = Math.max(1, lines.length); });
        return;
      }

      const frame = top();
      let target;

      if (frame && frame.lineIndex === lines.length - 1 && !frame.blockChild) {
        lines[frame.lineIndex] += text;
        target = frame.lineIndex;
      } else {
        lines.push(pad() + text);
        target = lines.length - 1;
      }

      carried.forEach(token => { token.outLine = target + 1; });
    }

    function markParentBlock() {
      const frame = top();
      if (frame) frame.blockChild = true;
    }

    function pushLine(text) {
      lines.push(pad() + text);
      return lines.length - 1;
    }

    tokens.forEach((token, index) => {
      const type = token.type;

      if (token.removed) {
        pending.push(token);
        return;
      }

      if (type === "text") {
        const text = token.value.replace(/\s+/g, " ");
        if (!text.trim()) {
          if (inline) inline += " ";
          return;
        }
        inline += inline ? text : text.replace(/^\s+/, "");
        pending.push(token);
        return;
      }

      if (type === "cond-open") {
        if (inlineCond[index]) { inline += token.value.trim(); pending.push(token); return; }
        flushInline();
        markParentBlock();
        token.outLine = pushLine(token.value.trim()) + 1;
        stack.push({ type: "cond", level: level, lineIndex: lines.length - 1, blockChild: true });
        level++;
        return;
      }

      if (type === "cond-close") {
        if (inlineCond[index]) { inline += token.value.trim(); pending.push(token); return; }
        flushInline();

        let frame = null;
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].type === "cond") { frame = stack[k]; stack.length = k; break; }
        }

        level = frame ? frame.level : Math.max(0, level - 1);
        token.outLine = pushLine(token.value.trim()) + 1;
        markParentBlock();
        return;
      }

      if (type === "doctype" || type === "comment") {
        flushInline();
        markParentBlock();
        token.outLine = pushLine(token.value.trim()) + 1;
        return;
      }

      if (type === "raw") {
        const cssIndex = cssTokens.indexOf(token);
        markParentBlock();

        if (cssIndex !== -1) {
          token.outBase = lines.length;
          token.outLine = lines.length + 1;
          serializeCssInto(cssTrees[cssIndex], level, indentUnit, []).forEach(row => lines.push(row));
          return;
        }

        token.outLine = lines.length + 1;

        /* <pre> and <textarea> keep every space and line break */
        if (VERBATIM_TAGS.has(token.name)) {
          if (!token.value) return;
          const rows = token.value.split("\n");
          lines[lines.length - 1] += rows[0];
          rows.slice(1).forEach(row => lines.push(row));
          const frame = top();
          if (frame) frame.verbatimEnd = true;
          return;
        }

        const body = token.value.replace(/^\n+|\s+$/g, "");
        if (!body.trim()) return;
        body.split("\n").forEach(row => {
          const clean = row.trim();
          lines.push(clean ? pad() + clean : "");
        });
        return;
      }

      if (type === "self" || type === "open" || type === "close") {
        const name = token.name;
        const value = token.value.replace(/\s+/g, " ").replace(/\s+>/, ">").trim();

        if (INLINE_TAGS.has(name)) { inline += value; pending.push(token); return; }

        flushInline();

        if (type === "close") {
          let found = -1;
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k].type === "tag" && stack[k].name === name) { found = k; break; }
            if (stack[k].type === "cond") break; /* never close across a conditional */
          }

          if (found === -1) {
            markParentBlock();
            token.outLine = pushLine(value) + 1;
            return;
          }

          const frame = stack[found];
          stack.length = found;
          level = frame.level;

          if (frame.verbatimEnd || (frame.lineIndex === lines.length - 1 && !frame.blockChild)) {
            lines[lines.length - 1] += value;
            token.outLine = lines.length;
          } else {
            token.outLine = pushLine(value) + 1;
          }

          markParentBlock();
          return;
        }

        markParentBlock();
        const lineIndex = pushLine(value);
        token.outLine = lineIndex + 1;

        if (type === "open") {
          stack.push({ type: "tag", name: name, level: level, lineIndex: lineIndex, blockChild: false });
          level++;
        }
      }
    });

    flushInline();

    return lines.join("\n").replace(/[ \t]+$/gm, "");
  }

  return {
    process: process,
    tokenize: tokenize,
    parseTag: parseTag,
    parseCss: parseCss
  };
});

(() => {
  "use strict";

  /* The engine above also runs in Node for tests; the UI needs a page. */
  if (typeof document === "undefined") return;

  const byId = id => document.getElementById(id);

  const input = byId("input");
  const output = byId("output");
  const reportFixed = byId("reportFixed");
  const reportOpen = byId("reportOpen");
  const reportSub = byId("reportSub");
  const fixedCount = byId("fixedCount");
  const openCount = byId("openCount");
  const summary = byId("summary");
  const status = byId("status");
  const inputMeta = byId("inputMeta");
  const outputMeta = byId("outputMeta");
  const indentSelect = byId("indentSelect");
  const themeSelect = byId("themeSelect");
  const fileInput = byId("fileInput");
  const statsBar = byId("stats");
  const searchBox = byId("reportSearch");
  const filterBar = byId("filters");
  const groupFilter = byId("groupFilter");
  const showDetails = byId("optShowDetails");
  const verdict = byId("verdict");
  const verdictTitle = byId("verdictTitle");
  const lineFilterBox = byId("lineFilter");
  const lineFilterText = byId("lineFilterText");
  const settings = byId("settings");
  const settingsMeta = byId("settingsMeta");
  const charsTable = byId("charsTable");
  const charsSub = byId("charsSub");
  const charsEmpty = byId("charsEmpty");
  const charFilters = byId("charFilters");
  const encodeAllBtn = byId("encodeAllBtn");
  const toast = byId("toast");

  const toggles = {
    autofix: byId("optAutofix"),
    tableAttrs: byId("optTableAttrs"),
    requireBorder: byId("optRequireBorder"),
    widthSync: byId("optWidthSync"),
    heightSync: byId("optHeightSync"),
    forceWidthFix: byId("optForceWidthFix"),
    mediaSync: byId("optMediaSync"),
    crossMedia: byId("optCrossMedia"),
    duplicateProps: byId("optDuplicateProps"),
    emptyAttrs: byId("optEmptyAttrs"),
    unusedClasses: byId("optUnusedClasses"),
    bestPractice: byId("optBestPractice"),
    expandConditionals: byId("optExpandConditionals"),
    htmlValidation: byId("optHtmlValidation"),
    cssValidation: byId("optCssValidation"),
    asciiCheck: byId("optAsciiCheck"),
    encodeChars: byId("optEncodeChars"),
    shortenCss: byId("optShortenCss")
  };

  const DEFAULTS = {};
  for (const key in toggles) DEFAULTS[key] = toggles[key].defaultChecked;

  const GROUP_TITLES = {
    "internal": "Tool problems",
    "structure": "Tag structure",
    "document": "Document setup",
    "html-validity": "HTML validity",
    "attributes": "Attributes",
    "table-attrs": "Table attributes",
    "table-layout": "Table layout",
    "dimension-sync": "Width and height",
    "media-sync": "Media query parity",
    "cross-media": "Breakpoint differences",
    "duplicate-prop": "Duplicate properties",
    "empty-attr": "Empty attributes",
    "links": "Links",
    "images": "Images",
    "merge-tags": "Merge tags & profile fields",
    "css": "CSS validity",
    "support": "Email client support",
    "redundant": "Unused & redundant code",
    "css-shorthand": "Simpler CSS",
    "ascii": "ASCII / special characters",
    "accessibility": "Accessibility",
    "content": "Copy",
    "spacing": "Spacing",
    "practice": "Email best practice",
    "unused-class": "Classes"
  };

  const GROUP_ORDER = [
    "internal",
    "structure",
    "document",
    "html-validity",
    "attributes",
    "table-attrs",
    "table-layout",
    "dimension-sync",
    "links",
    "images",
    "merge-tags",
    "css",
    "support",
    "media-sync",
    "cross-media",
    "duplicate-prop",
    "empty-attr",
    "redundant",
    "css-shorthand",
    "unused-class",
    "ascii",
    "accessibility",
    "content",
    "spacing",
    "practice"
  ];

  const LEVEL_LABEL = { error: "Error", warn: "Review", info: "Note", fix: "Fixed" };
  const SEVERITY = { error: 0, warn: 1, info: 2, fix: 3 };

  let lastIssues = [];
  let lastStats = null;
  let lastChars = [];
  let levelFilter = "all";
  let groupValue = "all";
  let lineValue = 0;
  let charFilter = "all";
  let lastOutput = "";

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  const plural = (n, word, many) => n + " " + (n === 1 ? word : (many || word + "s"));

  let toastTimer = null;
  function showToast(message, type) {
    toast.textContent = message;
    toast.className = "toast show" + (type === "err" ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 1800);
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = "status " + (type || "");
  }

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (error) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (error) { /* private mode */ } }
  };

  /* ---------------------------------------------------------------- */
  /* Output pane                                                       */
  /* ---------------------------------------------------------------- */

  /* ---------------- syntax colouring for the output pane ---------------- */

  const escHtml = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const MERGE_SPLIT = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|%%[^%\s<>][^%<>]*?%%|\*\|[^|]*?\|\*|\$\{[^}]*\}|\[\[[^\]]*\]\])/g;
  const span = (cls, html) => '<span class="' + cls + '">' + html + "</span>";

  function hlText(text) {
    return String(text).split(MERGE_SPLIT).map((part, i) => {
      if (i % 2) return span("t-merge", escHtml(part));
      return escHtml(part).replace(/&amp;(#?[a-z0-9]+;)/gi, (m, body) => span("t-ent", "&amp;" + body));
    }).join("");
  }

  function hlTag(tag) {
    const m = /^(<\/?)([^\s>\/]+)([\s\S]*?)(\/?>)?$/.exec(tag);
    if (!m) return hlText(tag);
    let out = span("t-punc", escHtml(m[1])) + span("t-tag", escHtml(m[2]));
    const re = /([^\s="'<>\/]+)(\s*=\s*)?("[^"]*"?|'[^']*'?|[^\s"'>]+)?|(\s+)|([\s\S])/g;
    let a;
    while ((a = re.exec(m[3])) !== null) {
      if (a[1]) {
        out += span("t-attr", escHtml(a[1]));
        if (a[2] !== undefined) out += span("t-punc", escHtml(a[2]));
        if (a[3] !== undefined) out += span("t-val", hlText(a[3]));
      } else if (a[4]) out += a[4];
      else out += span("t-punc", escHtml(a[5]));
    }
    return out + span("t-punc", escHtml(m[4] || ""));
  }

  function hlDecls(text) {
    let out = "";
    const re = /([a-zA-Z-]+)(\s*:\s*)([^;{}]*)(;?)|([{}])|(\s+)|([\s\S])/g;
    let d;
    while ((d = re.exec(text)) !== null) {
      if (d[1] && d[2]) {
        const value = escHtml(d[3]).replace(/!\s*important/gi, m => span("t-imp", m));
        out += span("t-prop", escHtml(d[1])) + span("t-punc", escHtml(d[2])) + span("t-cssval", value) + span("t-punc", d[4]);
      } else if (d[5]) out += span("t-punc", d[5]);
      else if (d[6]) out += d[6];
      else out += escHtml(d[1] || d[7] || "");
    }
    return out;
  }

  function hlCss(row) {
    const trimmed = row.trim();
    if (/^\/\*/.test(trimmed)) return span("t-com", escHtml(row));
    const brace = row.indexOf("{");
    if (brace === -1) return /^@/.test(trimmed) ? span("t-at", escHtml(row)) : hlDecls(row);
    const selector = row.slice(0, brace);
    return span(/^\s*@/.test(selector) ? "t-at" : "t-sel", escHtml(selector)) + hlDecls(row.slice(brace));
  }

  function hlLine(row, state) {
    if (state.css && !/<\/style/i.test(row)) return hlCss(row);
    let out = "";
    const re = /(<!--\s*\[if[^\]]*\]>(?:<!-->)?|<!--\s*<!\[endif\]\s*-->|<!\[endif\]\s*-->)|(<!--[\s\S]*?(?:-->|$))|(<!doctype[^>]*>?)|(<\/?[a-zA-Z][^>]*>?)|([^<]+)|(<)/gi;
    let m;
    while ((m = re.exec(row)) !== null) {
      if (m[1]) out += span("t-cond", escHtml(m[1]));
      else if (m[2]) out += span("t-com", escHtml(m[2]));
      else if (m[3]) out += span("t-doc", escHtml(m[3]));
      else if (m[4]) {
        out += hlTag(m[4]);
        if (/^<style\b/i.test(m[4])) state.css = true;
        if (/^<\/style/i.test(m[4])) state.css = false;
      } else if (m[5]) out += state.css ? hlCss(m[5]) : hlText(m[5]);
      else out += escHtml(m[6]);
    }
    return out;
  }

  /* The output pane is drawn line by line so every finding can be
     reached by its line number. Very large files stay plain text. */
  function paintOutput(text, issues) {
    lastOutput = text;
    output.innerHTML = "";

    if (!text) {
      output.appendChild(el("div", "output-empty", "The formatted HTML appears here after a check."));
      return;
    }

    const rows = text.split("\n");

    if (rows.length > 20000) {
      output.textContent = text;
      return;
    }

    /* worst finding per line, for the gutter markers */
    const marks = new Map();
    (issues || []).forEach(issue => {
      if (!issue.line) return;
      const mark = marks.get(issue.line) || { level: "fix", messages: [] };
      if (SEVERITY[issue.level] < SEVERITY[mark.level]) mark.level = issue.level;
      if (mark.messages.length < 6) mark.messages.push(LEVEL_LABEL[issue.level] + ": " + issue.message);
      marks.set(issue.line, mark);
    });

    const state = { css: false };
    const parts = [];

    rows.forEach((row, index) => {
      const lineNo = index + 1;
      const mark = marks.get(lineNo);
      let code;
      try { code = hlLine(row, state); } catch (error) { code = escHtml(row); }

      parts.push(
        '<div class="code-line' + (mark ? " mark-" + mark.level : "") + '" data-line="' + lineNo + '">' +
        '<span class="ln"' + (mark ? ' title="' + escHtml(mark.messages.join("\n") + "\n\nClick to show this line's findings") + '"' : "") + ">" + lineNo + "</span>" +
        '<span class="src">' + (code || " ") + "</span></div>"
      );
    });

    output.innerHTML = parts.join("");
  }

  output.addEventListener("click", event => {
    const number = event.target.closest(".ln");
    if (!number) return;
    const row = number.parentElement;
    if (!/mark-/.test(row.className)) return;
    setLineFilter(Number(row.dataset.line));
    byId("report").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function jumpToLine(line) {
    const row = output.querySelector('[data-line="' + line + '"]');

    if (!row) {
      setStatus("Line " + line + " is not shown in this view.", "err");
      return;
    }

    output.querySelectorAll(".code-line.flash").forEach(node => node.classList.remove("flash"));
    row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 1800);

    const top = row.offsetTop - output.clientHeight / 2 + row.offsetHeight / 2;
    output.scrollTo({ top: Math.max(0, top), behavior: "smooth" });

    const box = output.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      output.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function lineChips(lines, hidden) {
    const wrap = el("span", "lines");
    lines.forEach(line => {
      const chip = el("button", "line-chip", "L" + line);
      chip.type = "button";
      chip.title = "Jump to line " + line + " of the formatted output";
      chip.addEventListener("click", () => jumpToLine(line));
      wrap.appendChild(chip);
    });
    if (hidden) {
      const more = el("span", "line-chip more", "+" + hidden);
      more.title = hidden + " more lines";
      wrap.appendChild(more);
    }
    return wrap;
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  function readOptions() {
    const indent = indentSelect.value === "tab"
      ? "\t"
      : " ".repeat(Number(indentSelect.value));

    const opts = { indent: indent };
    for (const key in toggles) opts[key] = toggles[key].checked;
    return opts;
  }

  function paintToggles() {
    let on = 0;
    const total = Object.keys(toggles).length;
    for (const key in toggles) {
      toggles[key].parentElement.classList.toggle("on", toggles[key].checked);
      if (toggles[key].checked) on++;
    }
    const changed = Object.keys(toggles).filter(key => toggles[key].checked !== DEFAULTS[key]).length;
    settingsMeta.textContent = on + " of " + total + " on" + (changed ? " · " + changed + " changed from default" : "");
  }

  function saveSettings() {
    const values = {};
    for (const key in toggles) values[key] = toggles[key].checked;
    store.set("ehb-settings", JSON.stringify(values));
    store.set("ehb-indent", indentSelect.value);
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(store.get("ehb-settings") || "null");
      if (saved) for (const key in toggles) if (typeof saved[key] === "boolean") toggles[key].checked = saved[key];
    } catch (error) { /* ignore a damaged value */ }

    const indent = store.get("ehb-indent");
    if (indent && Array.from(indentSelect.options).some(o => o.value === indent)) indentSelect.value = indent;
    if (store.get("ehb-settings-open") === "1") settings.open = true;
  }

  /* ---------------------------------------------------------------- */
  /* Meta + theme                                                      */
  /* ---------------------------------------------------------------- */

  const GMAIL_LIMIT = 102400;

  function byteSize(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function sizeLabel(text) {
    return (byteSize(text) / 1024).toFixed(1) + " KB";
  }

  function updateMeta() {
    inputMeta.textContent = input.value.length.toLocaleString() + " chars · " + sizeLabel(input.value);

    const bytes = byteSize(lastOutput);
    outputMeta.textContent =
      lastOutput.length.toLocaleString() + " chars · " + sizeLabel(lastOutput) +
      (bytes > GMAIL_LIMIT ? " · over Gmail's 102 KB clip limit" : "");
    outputMeta.style.color = bytes > GMAIL_LIMIT ? "var(--danger)" : "";
  }

  function applyTheme(name) {
    document.documentElement.setAttribute("data-theme", name);
    store.set("ehb-theme", name);
  }

  function initTheme() {
    const name = store.get("ehb-theme") || "soft";
    themeSelect.value = name;
    document.documentElement.setAttribute("data-theme", name);
  }

  function loadFile(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      input.value = String(reader.result || "");
      saveInput();
      setStatus(file.name + " loaded.", "ok");
      run();
    };

    reader.onerror = () => setStatus("Could not read " + file.name + ".", "err");
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------- */
  /* Stats, verdict, summary                                           */
  /* ---------------------------------------------------------------- */

  function statTile(key, value, tone, hint) {
    const tile = el("div", "stat" + (tone ? " " + tone : ""));
    if (hint) tile.title = hint;
    tile.appendChild(el("span", "k", key));
    tile.appendChild(el("span", "v", value));
    return tile;
  }

  function renderStats(stats) {
    statsBar.innerHTML = "";
    if (!stats) return;

    const links = stats.links;
    const bytes = byteSize(lastOutput);

    const notLinkedHint = [
      links.missing + " with no href",
      links.empty + ' with href=""',
      links.placeholder + ' with href="#"',
      links.anchor + " anchor only",
      links.relative + " relative path"
    ].join(" · ");

    [
      statTile("Lines", stats.lines.toLocaleString(), "", stats.lines + " lines of formatted output checked"),
      statTile("Output", (bytes / 1024).toFixed(1) + " KB", bytes > GMAIL_LIMIT ? "bad" : "good",
        bytes > GMAIL_LIMIT ? "Over Gmail's 102 KB clipping limit" : "Under Gmail's 102 KB clipping limit"),
      statTile("Links", links.total, "", "Every <a> tag in the document"),
      statTile("Linked", links.linked, links.linked ? "good" : "", "Full URLs, merge tags, mailto and tel"),
      statTile("Not linked", links.notLinked, links.notLinked ? "flag" : "", notLinkedHint),
      statTile("http://", links.http, links.http ? "flag" : "", "Links still on http:// instead of https://"),
      statTile("mailto:", links.mailto, "", "Links that open a mail client"),
      statTile("tel:", links.tel, "", "Links that dial a number"),
      statTile("Images", stats.images, "", "Total <img> tags"),
      statTile("Tables", stats.tables, "", "Total <table> tags"),
      statTile("Conditionals", stats.conditionals, "", "Outlook conditional blocks"),
      statTile("Breakpoints", stats.breakpoints, "", stats.mediaBlocks + " @media blocks in total"),
      statTile("Merge tags", stats.mergeTags, "", "Merge tags and #profile# fields found"),
      statTile("Raw special chars", stats.specialChars, stats.specialChars ? "flag" : "good", "Special characters written raw — see the Special characters panel below")
    ].forEach(tile => statsBar.appendChild(tile));
  }

  function counts(issues) {
    const c = { fix: 0, warn: 0, error: 0, info: 0 };
    issues.forEach(issue => { c[issue.level] = (c[issue.level] || 0) + 1; });
    return c;
  }

  function renderVerdict(issues) {
    const c = counts(issues);
    let state = "ok";
    let title = "Ready to send — no errors or review items";

    if (c.error) {
      state = "bad";
      title = plural(c.error, "problem") + " to fix before sending";
    } else if (c.warn) {
      state = "warn";
      title = "No blocking errors · " + plural(c.warn, "item") + " to review";
    }

    verdict.dataset.state = state;
    verdictTitle.textContent = title;
  }

  function renderSummary(issues) {
    const c = counts(issues);
    summary.innerHTML = "";

    [["error", c.error, "To fix by hand"], ["warn", c.warn, "To review"], ["info", c.info, "Notes"], ["fix", c.fix, "Fixed"]]
      .forEach(([level, n, label]) => {
        const card = el("button", "card " + level + (n ? " has" : "") + (levelFilter === level ? " on" : ""));
        card.type = "button";
        card.dataset.filter = level;
        card.title = level === "fix" ? "Changes the tool made for you" : "Show only " + label.toLowerCase();
        card.appendChild(el("span", "n", n));
        card.appendChild(el("span", "l", label));
        summary.appendChild(card);
      });

    filterBar.querySelectorAll(".chip").forEach(chip => {
      const level = chip.dataset.filter;
      const n = level === "all" ? c.error + c.warn + c.info : c[level];
      const base = { all: "All", error: "Errors", warn: "Review", info: "Notes" }[level];
      chip.textContent = base;
      chip.appendChild(el("span", "c", n));
    });
  }

  summary.addEventListener("click", event => {
    const card = event.target.closest(".card");
    if (!card) return;
    if (card.dataset.filter === "fix") {
      byId("reportFixed").scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    setLevelFilter(levelFilter === card.dataset.filter ? "all" : card.dataset.filter);
  });

  /* ---------------------------------------------------------------- */
  /* Findings                                                          */
  /* ---------------------------------------------------------------- */

  /* Repeated findings fold into a single row with a count. */
  function aggregate(issues) {
    const map = new Map();

    issues.forEach(issue => {
      const key = issue.rule + "||" + issue.level + "||" + issue.message;

      if (!map.has(key)) {
        map.set(key, {
          rule: issue.rule,
          level: issue.level,
          message: issue.message,
          count: 0,
          details: [],
          hidden: 0,
          lines: [],
          allLines: [],
          hiddenLines: 0
        });
      }

      const entry = map.get(key);
      entry.count++;

      if (issue.line && entry.allLines.indexOf(issue.line) === -1) {
        entry.allLines.push(issue.line);
        if (entry.lines.length < 8) entry.lines.push(issue.line);
        else entry.hiddenLines++;
      }

      if (!issue.detail) return;
      if (entry.details.length < 3) entry.details.push(issue.detail);
      else entry.hidden++;
    });

    const rows = Array.from(map.values());
    rows.forEach(row => row.lines.sort((a, b) => a - b));
    return rows;
  }

  function renderColumn(container, issues, emptyText) {
    container.innerHTML = "";

    if (!issues.length) {
      container.appendChild(el("div", "empty-state", emptyText));
      return;
    }

    const rows = aggregate(issues);
    const groups = new Map();

    rows.forEach(row => {
      if (!groups.has(row.rule)) groups.set(row.rule, []);
      groups.get(row.rule).push(row);
    });

    /* groups holding errors first, then the usual order */
    const worst = key => Math.min.apply(null, groups.get(key).map(row => SEVERITY[row.level]));
    const keys = Array.from(groups.keys()).sort(
      (a, b) => (worst(a) - worst(b)) || (GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))
    );

    keys.forEach(key => {
      const list = groups.get(key).sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level]);
      const total = list.reduce((sum, row) => sum + row.count, 0);
      const errors = list.filter(row => row.level === "error").reduce((sum, row) => sum + row.count, 0);

      const section = el("div", "issue-group");
      section.dataset.group = key;

      const title = el("div", "group-title", GROUP_TITLES[key] || key);
      title.appendChild(el("span", "group-count", total));
      if (errors && container === reportOpen) title.appendChild(el("span", "group-bad", plural(errors, "error")));
      section.appendChild(title);

      list.forEach(row => {
        const item = el("div", "issue lv-" + row.level);
        item.dataset.level = row.level;
        item.dataset.group = key;
        item.dataset.lines = "," + row.allLines.join(",") + ",";
        item.dataset.text = (row.message + " " + row.details.join(" ") + " " + (GROUP_TITLES[key] || key)).toLowerCase();

        const body = el("div");
        const head = el("div", "issue-row");
        const text = el("span", "msg");

        text.appendChild(el("span", "lvl " + row.level, LEVEL_LABEL[row.level]));
        text.appendChild(document.createTextNode(row.message));
        if (row.count > 1) text.appendChild(el("span", "times", "×" + row.count));

        head.appendChild(text);
        if (row.lines.length) head.appendChild(lineChips(row.lines, row.hiddenLines));
        body.appendChild(head);

        if (row.details.length) {
          const wrap = el("details", "detail-wrap");
          wrap.open = showDetails.checked;
          wrap.appendChild(el("summary", null, row.details.length === 1 ? "details" : row.details.length + " examples"));
          wrap.appendChild(el("div", "detail",
            row.details.join("\n") + (row.hidden ? "\n+ " + row.hidden + " more" : "")));
          body.appendChild(wrap);
        }

        item.appendChild(el("span", "dot " + row.level));
        item.appendChild(body);
        section.appendChild(item);
      });

      container.appendChild(section);
    });
  }

  function renderGroupFilter(issues) {
    const present = new Map();
    issues.forEach(issue => present.set(issue.rule, (present.get(issue.rule) || 0) + 1));

    groupFilter.innerHTML = "";
    const all = el("option", null, "All categories");
    all.value = "all";
    groupFilter.appendChild(all);

    GROUP_ORDER.filter(key => present.has(key)).forEach(key => {
      const option = el("option", null, (GROUP_TITLES[key] || key) + " (" + present.get(key) + ")");
      option.value = key;
      groupFilter.appendChild(option);
    });

    if (!present.has(groupValue)) groupValue = "all";
    groupFilter.value = groupValue;
  }

  function applyFilters() {
    const term = searchBox.value.trim().toLowerCase();
    let visible = 0;

    document.querySelectorAll(".report-body .issue").forEach(row => {
      const inFixed = row.closest("#reportFixed");
      const levelOk = levelFilter === "all" || row.dataset.level === levelFilter || inFixed;
      const groupOk = groupValue === "all" || row.dataset.group === groupValue;
      const lineOk = !lineValue || row.dataset.lines.indexOf("," + lineValue + ",") !== -1;
      const textOk = !term || row.dataset.text.indexOf(term) !== -1;
      const show = levelOk && groupOk && lineOk && textOk;

      row.classList.toggle("hidden", !show);
      if (show && !inFixed) visible++;
    });

    document.querySelectorAll(".report-body .issue-group").forEach(group => {
      group.style.display = group.querySelector(".issue:not(.hidden)") ? "" : "none";
    });

    if ((term || levelFilter !== "all" || groupValue !== "all" || lineValue) && !visible && lastIssues.length) {
      setStatus("No findings match this filter.", "");
    }
  }

  function setLevelFilter(level) {
    levelFilter = level;
    filterBar.querySelectorAll(".chip").forEach(chip => chip.classList.toggle("on", chip.dataset.filter === level));
    summary.querySelectorAll(".card").forEach(card => card.classList.toggle("on", card.dataset.filter === level));
    applyFilters();
  }

  function setLineFilter(line) {
    lineValue = line || 0;
    lineFilterBox.hidden = !lineValue;
    lineFilterText.textContent = lineValue ? "Line " + lineValue : "";
    applyFilters();
  }

  function renderReport(issues) {
    renderVerdict(issues);
    renderSummary(issues);
    renderGroupFilter(issues);

    const fixed = issues.filter(issue => issue.level === "fix");
    const open = issues.filter(issue => issue.level !== "fix");

    fixedCount.textContent = fixed.length;
    openCount.textContent = open.length;

    renderColumn(reportOpen, open, "Nothing left to review.");
    renderColumn(
      reportFixed,
      fixed,
      toggles.autofix.checked
        ? "Nothing needed fixing."
        : "Fixes are switched off, so nothing was changed."
    );

    renderStats(lastStats);
    applyFilters();

    const checked = lastStats ? lastStats.lines.toLocaleString() + " lines checked · " : "";

    reportSub.textContent = issues.length
      ? checked + plural(fixed.length, "change") + " applied · " + plural(open.length, "item") + " left for you"
      : checked + "Every check passed.";
  }

  function clearReport() {
    reportFixed.innerHTML = "";
    reportOpen.innerHTML = "";
    statsBar.innerHTML = "";
    summary.innerHTML = "";
    lastStats = null;
    lastChars = [];
    fixedCount.textContent = "0";
    openCount.textContent = "0";
    verdict.dataset.state = "idle";
    verdictTitle.textContent = "Paste HTML to start";
    reportSub.textContent = "Run a format to see the results.";
    renderGroupFilter([]);
    setLineFilter(0);
    renderChars([]);
  }

  function reportAsText(issues) {
    if (!issues.length) return "Email HTML checks: all passed.";

    const tag = { error: "[ERROR] ", warn: "[REVIEW] ", info: "[NOTE] ", fix: "" };
    const line = issue =>
      "- " + tag[issue.level] + (issue.line ? "L" + issue.line + "  " : "") + issue.message +
      (issue.detail ? "\n    " + issue.detail : "");
    const byLine = (a, b) => (SEVERITY[a.level] - SEVERITY[b.level]) || (a.line - b.line);
    const fixedList = issues.filter(i => i.level === "fix").sort((a, b) => a.line - b.line);
    const openList = issues.filter(i => i.level !== "fix").sort(byLine);

    const parts = [
      "ENVELYZE REPORT — " + verdictTitle.textContent,
      "",
      "NEEDS ATTENTION (" + openList.length + ")",
      openList.length ? openList.map(line).join("\n") : "- nothing",
      "",
      "FIXED (" + fixedList.length + ")",
      fixedList.length ? fixedList.map(line).join("\n") : "- nothing"
    ];

    if (lastChars.length) parts.push("", "SPECIAL CHARACTERS (" + lastChars.length + ")", charsAsText(lastChars));
    return parts.join("\n");
  }

  /* ---------------------------------------------------------------- */
  /* Special characters panel                                          */
  /* ---------------------------------------------------------------- */

  const STATUS_TEXT = {
    needs: ["Needs encoding", "Written as the raw character. Replace it with the code in “Paste this”."],
    invisible: ["Invisible — check", "You can't see it, but it is there. Usually pasted from Word or Google Docs."],
    optional: ["Optional", "Plain ASCII, but on the DARTmail list. Encode it only if your ESP reads it as a merge-tag marker."],
    fixed: ["Replaced in output", "The tool wrote it as a code in the formatted HTML. Nothing to do."],
    ok: ["Already encoded", "Your HTML already uses the code. Nothing to do."]
  };

  const WHERE_TEXT = { text: "text", attr: "attribute", css: "CSS", url: "URL" };

  function statusOf(c) {
    if (c.status === "needs" && c.invisible) return "invisible";
    return c.status;
  }

  function copyButton(code, best, label) {
    const button = el("button", "code-copy" + (best ? " best" : ""));
    button.type = "button";
    button.title = "Copy " + (label || code);
    button.appendChild(el("span", "val", code));
    const act = el("span", "act", "Copy");
    button.appendChild(act);
    button.addEventListener("click", () => {
      copyText(code, "Copied " + code, true).then(ok => {
        if (!ok) return;
        button.classList.add("done");
        act.textContent = "Copied ✓";
        setTimeout(() => { button.classList.remove("done"); act.textContent = "Copy"; }, 1400);
      });
    });
    return button;
  }

  /* one example: line chip + the text around the character, highlighted */
  function whereRow(c, e, kind) {
    const row = el("div", "where-row");
    if (e.line) row.appendChild(lineChips([e.line], 0));

    const ctx = el("span", "ctx");
    ctx.appendChild(document.createTextNode((e.before.length >= 28 ? "…" : "") + e.before));
    const mark = el("mark", kind === "left" ? (c.invisible ? "inv" : "") : "done",
      kind === "left" && c.invisible ? (c.short || "?") : e.match);
    ctx.appendChild(mark);
    ctx.appendChild(document.createTextNode(e.after + (e.after.length >= 28 ? "…" : "")));
    ctx.appendChild(el("span", "in", "in " + (WHERE_TEXT[e.where] || e.where)));
    ctx.title = e.before + e.match + e.after;
    row.appendChild(ctx);
    return row;
  }

  function renderCharCards() {
    const count = st => lastChars.filter(c => st === "all" || c.status === st).length;
    const cards = [
      ["needs", count("needs") + count("optional"), "To encode", "written as raw characters"],
      ["fixed", count("fixed"), "Replaced by the tool", "now codes in the output"],
      ["ok", count("ok"), "Already encoded", "your HTML uses the code"],
      ["all", lastChars.length, "All characters", lastChars.reduce((sum, c) => sum + c.total, 0).toLocaleString() + " times in total"]
    ];

    charFilters.innerHTML = "";
    cards.forEach(([key, n, label, sub]) => {
      const card = el("button", "char-card " + key + (n ? " has" : "") + (charFilter === key ? " on" : ""));
      card.type = "button";
      card.dataset.filter = key;
      card.title = "Show " + label.toLowerCase();
      card.appendChild(el("span", "n", n));
      const text = el("span");
      text.appendChild(el("span", "l", label));
      text.appendChild(el("span", "s", sub));
      card.appendChild(text);
      charFilters.appendChild(card);
    });
  }

  function renderCallout() {
    const box = byId("charCallout");
    const textBox = byId("charCalloutText");
    textBox.innerHTML = "";

    const needs = lastChars.filter(c => c.status === "needs");
    const rawLeft = needs.reduce((sum, c) => sum + c.left, 0);
    const replacedChars = lastChars.filter(c => c.fixed).length;
    const replaced = lastChars.reduce((sum, c) => sum + c.fixed, 0);
    const amount = (chars, places) => plural(chars, "character") + (places !== chars ? " (" + plural(places, "place") + ")" : "");
    const inCss = needs.reduce((sum, c) => sum + (c.leftWhere.css || 0), 0);
    const add = (text, bold) => textBox.appendChild(bold ? el("b", null, text) : document.createTextNode(text));

    encodeAllBtn.hidden = true;

    if (!lastStats) {
      box.dataset.tone = "idle";
      add("Run a check to list the special characters.");
      return;
    }
    if (!toggles.asciiCheck.checked) {
      box.dataset.tone = "idle";
      add("The ASCII checker is switched off in Check settings.");
      return;
    }
    if (!lastChars.length) {
      box.dataset.tone = "ok";
      add("No special characters — everything is plain ASCII. Nothing to do.");
      return;
    }

    if (toggles.encodeChars.checked) {
      box.dataset.tone = rawLeft ? "warn" : "ok";
      add("Encoding is on: ");
      add(amount(replacedChars, replaced) + " replaced", true);
      add(" with codes in the formatted HTML.");
      if (rawLeft) {
        add(" ");
        add(amount(needs.length, rawLeft) + " still raw", true);
        add(inCss ? " — CSS can't use HTML codes, so change those by hand with the CSS code shown." : " — change those by hand.");
      }
      encodeAllBtn.hidden = false;
      encodeAllBtn.textContent = "Turn encoding off";
      encodeAllBtn.classList.remove("primary");
      return;
    }

    if (rawLeft) {
      box.dataset.tone = "warn";
      add(amount(needs.length, rawLeft) + " written raw", true);
      add(". Some clients and ESPs show raw characters as “Ã©” or “?”. Copy the code in “Paste this”, or let the tool replace them for you.");
      encodeAllBtn.hidden = false;
      encodeAllBtn.textContent = "Encode them in the output";
      encodeAllBtn.classList.add("primary");
      return;
    }

    box.dataset.tone = "ok";
    add("All special characters are already written as codes. Nothing to do.");
  }

  function renderChars(chars) {
    lastChars = chars || [];
    charsTable.innerHTML = "";

    renderCharCards();
    renderCallout();

    if (!lastChars.length) {
      charsEmpty.style.display = "";
      charsEmpty.textContent = lastStats
        ? (toggles.asciiCheck.checked ? "No special characters — everything is plain ASCII." : "The ASCII checker is switched off.")
        : "No special characters yet — run a check.";
      return;
    }

    charsEmpty.style.display = "none";

    lastChars.forEach(c => {
      const st = statusOf(c);
      const tr = el("tr", "st-" + c.status);
      tr.dataset.status = c.status;

      /* character */
      const idCell = el("td");
      const id = el("div", "char-id");
      const glyph = el("button", "glyph" + (c.invisible ? " inv" : ""), c.short || c.char);
      glyph.type = "button";
      glyph.title = "Copy the character itself";
      glyph.addEventListener("click", () => copyText(c.char, "Copied the character " + (c.short || c.char), true));
      id.appendChild(glyph);
      const names = el("div");
      names.appendChild(el("div", "char-name", c.name));
      names.appendChild(el("div", "char-sub", c.unicode + (c.cp > 127 ? "  ·  code point " + c.cp : "")));
      if (c.listed) {
        const tags = el("div", "char-tags");
        const tag = el("span", "tag listed", "DARTmail list");
        tag.title = "On the character list from the DARTmail Helper";
        tags.appendChild(tag);
        names.appendChild(tags);
      }
      id.appendChild(names);
      idCell.appendChild(id);
      tr.appendChild(idCell);

      /* status */
      const statusCell = el("td");
      statusCell.appendChild(el("span", "status-badge " + st, STATUS_TEXT[st][0]));
      statusCell.appendChild(el("div", "status-note", STATUS_TEXT[st][1]));
      tr.appendChild(statusCell);

      /* counts */
      const countCell = el("td", "num");
      countCell.appendChild(el("div", "count-total", c.total.toLocaleString()));
      const breakdown = el("div", "count-break");
      const line = (n, text) => {
        const row = el("div");
        row.appendChild(el("b", null, n.toLocaleString()));
        row.appendChild(document.createTextNode(" " + text));
        breakdown.appendChild(row);
      };
      if (c.left) {
        const places = Object.keys(c.leftWhere).filter(k => c.leftWhere[k]).map(k => WHERE_TEXT[k]);
        line(c.left, "raw" + (places.length ? " (" + places.join(", ") + ")" : ""));
      }
      if (c.fixed) line(c.fixed, "replaced by the tool");
      c.entityForms.forEach(f => line(f.count, "as " + f.form));
      countCell.appendChild(breakdown);
      tr.appendChild(countCell);

      /* paste this */
      const pasteCell = el("td");
      const paste = el("div", "paste");
      const leftIn = k => c.leftWhere[k] > 0;
      const onlyElsewhere = c.left && !leftIn("text") && !leftIn("attr");

      if (!onlyElsewhere) {
        if (leftIn("css") || leftIn("url")) paste.appendChild(el("span", "paste-label", "In HTML"));
        paste.appendChild(copyButton(c.codes.html, true, "the HTML code for " + c.name));
      }
      if (leftIn("css")) {
        paste.appendChild(el("span", "paste-label", "In CSS"));
        paste.appendChild(copyButton(c.codes.css.trim(), true, "the CSS escape for " + c.name));
      }
      if (leftIn("url")) {
        paste.appendChild(el("span", "paste-label", "In a URL"));
        paste.appendChild(copyButton(c.codes.url, true, "the URL encoding for " + c.name));
      }

      const more = el("details", "more-codes");
      more.appendChild(el("summary", null, "Other codes"));
      const grid = el("div", "code-grid");
      [
        ["Named", c.codes.named],
        ["Decimal", c.codes.decimal],
        ["Hex", c.codes.hex],
        ["CSS", c.codes.css.trim()],
        ["URL", c.codes.url],
        ["Character", c.char]
      ].forEach(([label, code]) => {
        if (!code) return;
        grid.appendChild(el("span", "k", label));
        grid.appendChild(copyButton(code, false, label.toLowerCase() + " for " + c.name));
      });
      more.appendChild(grid);
      paste.appendChild(more);
      pasteCell.appendChild(paste);
      tr.appendChild(pasteCell);

      /* where */
      const whereCell = el("td");
      const list = el("div", "where-list");
      const examples = c.examples.length
        ? c.examples.map(e => [e, "left"])
        : c.fixedExamples.map(e => [e, "fixed"]).concat(c.entityExamples.map(e => [e, "entity"]));
      examples.slice(0, 3).forEach(([e, kind]) => list.appendChild(whereRow(c, e, kind)));

      const allLines = c.examples.length ? c.lines : c.entityLines;
      const shown = new Set(examples.slice(0, 3).map(([e]) => e.line));
      const rest = allLines.filter(n => !shown.has(n));
      if (rest.length) {
        const moreRow = el("div", "where-row");
        moreRow.appendChild(el("span", "where-more", "Also on"));
        moreRow.appendChild(lineChips(rest.slice(0, 6), Math.max(0, rest.length - 6)));
        list.appendChild(moreRow);
      }
      whereCell.appendChild(list);
      tr.appendChild(whereCell);

      charsTable.appendChild(tr);
    });

    applyCharFilter();
  }

  function applyCharFilter() {
    charsTable.querySelectorAll("tr").forEach(tr => {
      const s = tr.dataset.status;
      const show = charFilter === "all" || s === charFilter || (charFilter === "needs" && s === "optional");
      tr.classList.toggle("hidden", !show);
    });
    charFilters.querySelectorAll(".char-card").forEach(card => card.classList.toggle("on", card.dataset.filter === charFilter));
  }

  function charsAsText(chars) {
    const rows = [["Symbol", "Name", "Unicode", "Status", "Total", "Raw", "Replaced by tool", "Already encoded", "HTML code", "Decimal", "Hex", "Lines"].join("\t")];
    chars.forEach(c => rows.push([
      c.short || c.char, c.name, c.unicode, STATUS_TEXT[statusOf(c)][0], c.total, c.left, c.fixed, c.entity,
      c.codes.html, c.codes.decimal, c.codes.hex, (c.lines.length ? c.lines : c.entityLines).join(" ")
    ].join("\t")));
    return rows.join("\n");
  }

  charFilters.addEventListener("click", event => {
    const card = event.target.closest(".char-card");
    if (!card) return;
    charFilter = charFilter === card.dataset.filter ? "all" : card.dataset.filter;
    applyCharFilter();
  });

  byId("copyCharsBtn").addEventListener("click", () => {
    if (!lastChars.length) { showToast("No special characters to copy", "err"); return; }
    copyText(charsAsText(lastChars), "Character list copied — paste it into Excel or Sheets", true);
  });

  encodeAllBtn.addEventListener("click", () => {
    toggles.encodeChars.checked = !toggles.encodeChars.checked;
    paintToggles();
    saveSettings();
    if (input.value.trim()) run();
    showToast(toggles.encodeChars.checked ? "Special characters replaced with codes in the output" : "Encoding switched off");
  });


  /* ---------------------------------------------------------------- */
  /* Run                                                               */
  /* ---------------------------------------------------------------- */

  function run() {
    if (!input.value.trim()) {
      paintOutput("");
      lastIssues = [];
      clearReport();
      updateMeta();
      setStatus("Paste HTML into the input first.");
      return;
    }

    try {
      const result = EmailTool.process(input.value, readOptions());
      lastStats = result.stats;
      lastIssues = result.issues;
      paintOutput(result.html, result.issues);
      setLineFilter(0);
      renderReport(result.issues);
      renderChars(result.characters || []);
      updateMeta();

      const fixed = result.issues.filter(i => i.level === "fix").length;
      const open = result.issues.length - fixed;
      const needsHand = result.issues.filter(i => i.level === "warn" || i.level === "error").length;

      setStatus(
        "Formatted. " + fixed + " fix" + (fixed === 1 ? "" : "es") + " applied · " + plural(open, "item") + " listed in the report.",
        needsHand ? "" : "ok"
      );
    } catch (error) {
      /* never leave the previous results on screen next to an error */
      if (typeof console !== "undefined" && console.error) console.error(error);
      paintOutput("");
      lastIssues = [];
      clearReport();
      updateMeta();
      setStatus("Could not check this HTML: " + error.message + " — please send the template so it can be fixed.", "err");
      showToast("Could not check this HTML", "err");
    }
  }

  /* Resolves true when the text reached the clipboard. */
  async function copyText(text, okMessage, quiet) {
    if (!text) {
      setStatus("Nothing to copy.", "err");
      showToast("Nothing to copy", "err");
      return false;
    }

    let ok = false;

    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (error) {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      temp.remove();
    }

    if (ok) {
      if (!quiet) setStatus(okMessage, "ok");
      showToast(okMessage);
    } else {
      setStatus("The browser blocked the clipboard — select and copy manually.", "err");
      showToast("Clipboard blocked by the browser", "err");
    }
    return ok;
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  byId("formatBtn").addEventListener("click", run);

  byId("copyBtn").addEventListener("click", () => {
    copyText(lastOutput, "Formatted HTML copied to clipboard.");
  });

  byId("copyReportBtn").addEventListener("click", () => {
    copyText(lastIssues.length || lastChars.length ? reportAsText(lastIssues) : "", "Check report copied to clipboard.");
  });

  byId("downloadBtn").addEventListener("click", () => {
    const text = lastOutput;

    if (!text) {
      setStatus("Nothing to download.", "err");
      showToast("Nothing to download", "err");
      return;
    }

    const blob = new Blob([text], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "formatted-email.html";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus("formatted-email.html downloaded.", "ok");
    showToast("formatted-email.html downloaded");
  });

  byId("clearBtn").addEventListener("click", () => {
    input.value = "";
    store.set("ehb-input", "");
    paintOutput("");
    lastIssues = [];
    clearReport();
    updateMeta();
    setStatus("Cleared.");
    input.focus();
  });

  indentSelect.addEventListener("change", () => { saveSettings(); if (input.value.trim()) run(); });

  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));

  searchBox.addEventListener("input", applyFilters);

  filterBar.addEventListener("click", event => {
    const chip = event.target.closest(".chip");
    if (chip) setLevelFilter(chip.dataset.filter);
  });

  groupFilter.addEventListener("change", () => {
    groupValue = groupFilter.value;
    applyFilters();
  });

  byId("lineFilterClear").addEventListener("click", () => setLineFilter(0));

  showDetails.addEventListener("change", () => {
    showDetails.parentElement.classList.toggle("on", showDetails.checked);
    document.querySelectorAll(".detail-wrap").forEach(node => { node.open = showDetails.checked; });
  });

  settings.addEventListener("toggle", () => store.set("ehb-settings-open", settings.open ? "1" : "0"));

  byId("resetSettings").addEventListener("click", () => {
    for (const key in toggles) toggles[key].checked = DEFAULTS[key];
    paintToggles();
    saveSettings();
    if (input.value.trim()) run();
    showToast("Settings reset to defaults");
  });

  byId("openBtn").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    loadFile(fileInput.files && fileInput.files[0]);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach(name => {
    input.addEventListener(name, event => {
      event.preventDefault();
      input.classList.add("dropping");
    });
  });

  ["dragleave", "dragend", "drop"].forEach(name => {
    input.addEventListener(name, () => input.classList.remove("dropping"));
  });

  input.addEventListener("drop", event => {
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    loadFile(file);
  });

  for (const key in toggles) {
    toggles[key].addEventListener("change", () => {
      paintToggles();
      saveSettings();
      if (input.value.trim()) run();
    });
  }

  /* the pasted HTML survives a refresh or an accidental tab close */
  let saveTimer = null;
  function saveInput() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const value = input.value;
      store.set("ehb-input", value.length < 2000000 ? value : "");
    }, 400);
  }

  input.addEventListener("input", () => { updateMeta(); saveInput(); });

  input.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const indent = indentSelect.value === "tab" ? "\t" : " ".repeat(Number(indentSelect.value));
      input.setRangeText(indent, start, end, "end");
    }
  });

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && event.target !== input) {
      event.preventDefault();
      run();
    }
  });

  /* Sample input that exercises every check. */
  const SAMPLE = '<html lang=""><head><style>body{margin:0;}.MsoHyperlink{color:#0000ee;}.wrapper{width:600px;width:640px;}.mHide{display:block;}.oldPromo{color:#999999;}@media only screen and (max-width:520px){.wrapper{width:100% !important;}.mHide{display:none !important;}.w100pc{width:100% !important;}}@media only screen and (max-width:520px){.wrapper{width:320px !important;}.mHide{display:none !important;}}@media only screen and (max-width:420px){.w100pc{width:200% !important;}}</style></head><body bgcolor=""><table width="100%" border="0" align="center" class=""><tr><td align="center" style="padding:0;"><table class="wrapper" width="600" border="0" cellpadding="0" style="width:640px;"><tr><td align="center" class="mHide  ghostClass" style="padding:20px;"><a href="https://example.com" target="_blank"><img src="logo.png" width="240" alt="" style="display:block;width:200px;" /></a></td></tr><tr><td align="left" style="padding:0 20px" style="padding:0 24px">Summer  offers are  live <strong>today</strong> – save 20&nbsp;€. <a href="mailto:hello@example.com">Mail us</a> or <a href="tel:+919000000000">call us</a>, <a href="#">terms</a> and <a href="">privacy</a>.</td></tr><tr><td align="center" class="w100pc"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="https://example.com/cta" style="height:44px;width:220px;" arcsize="10%" fillcolor="#e20074"><w:anchorlock/><center style="color:#ffffff;"><![endif]--><a href="https://example.com/cta" class="btn" style="display:block;">Jetzt buchen für Größe M</a><!--[if mso]></center></v:roundrect><![endif]--></td></tr></table></td></tr></table></body></html>';

  const savedInput = store.get("ehb-input");
  const restored = !!(savedInput && savedInput.trim());
  input.value = restored ? savedInput : SAMPLE;

  loadSettings();
  initTheme();
  paintToggles();
  updateMeta();
  run();
  if (restored) setStatus("Restored the HTML you were working on. Clear to start fresh.", "ok");
})();
