use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant, SystemTime};

use crate::server::state::{style_to_weight, FontRecord};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GoogleFontEntry {
    pub family: String,
    pub category: String,
    pub is_arabic: bool,
    #[serde(default)]
    pub is_latin: bool,
    #[serde(default)]
    pub is_variable: bool,
    #[serde(default)]
    pub subsets: Vec<String>,
    #[serde(default)]
    pub designers: Vec<String>,
    #[serde(default)]
    pub popularity: u32,
    pub variants: Vec<String>,
    pub download_url: String,
    pub is_downloaded: bool,
    pub is_active: bool,
}

type GoogleCatalogCacheEntry = (Instant, Vec<GoogleFontEntry>, String);

static GOOGLE_CATALOG_CACHE: OnceLock<RwLock<Option<GoogleCatalogCacheEntry>>> = OnceLock::new();
const GOOGLE_CATALOG_MEM_TTL: Duration = Duration::from_secs(900);
const GOOGLE_CATALOG_DISK_TTL: Duration = Duration::from_secs(86400);

pub struct GoogleFontsManager;
pub type GoogleFontsScanner = GoogleFontsManager;

struct CuratedDef {
    family: &'static str,
    category: &'static str,
    is_arabic: bool,
    variants: &'static [&'static str],
    download_url: &'static str,
}

const CURATED_GOOGLE_FONTS: &[CuratedDef] = &[
    // =========================================================================
    // 01 - Arabic Google Fonts (45 Top Families)
    // =========================================================================
    CuratedDef {
        family: "Cairo",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Tajawal",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/Tajawal-Regular.ttf",
    },
    CuratedDef {
        family: "Almarai",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Light", "Regular", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/almarai/Almarai-Regular.ttf",
    },
    CuratedDef {
        family: "Amiri",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Italic", "Bold", "BoldItalic"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf",
    },
    CuratedDef {
        family: "Changa",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/changa/Changa%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "El Messiri",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/elmessiri/ElMessiri%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Alexandria",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/alexandria/Alexandria%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Readex Pro",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/readexpro/ReadexPro%5BHEXP%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "IBM Plex Sans Arabic",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf",
    },
    CuratedDef {
        family: "Noto Sans Arabic",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Kufi Arabic",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notokufiarabic/NotoKufiArabic%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Naskh Arabic",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notonaskharabic/NotoNaskhArabic%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Rubiks Arabic",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/Rubik%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Aref Ruqaa",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/arefruqaa/ArefRuqaa-Regular.ttf",
    },
    CuratedDef {
        family: "Aref Ruqaa Ink",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/arefruqaaink/ArefRuqaaInk-Regular.ttf",
    },
    CuratedDef {
        family: "Reem Kufi",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/reemkufi/ReemKufi%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Reem Kufi Fun",
        category: "display",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/reemkufifun/ReemKufiFun%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Reem Kufi Ink",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/reemkufiink/ReemKufiInk-Regular.ttf",
    },
    CuratedDef {
        family: "Marhey",
        category: "display",
        is_arabic: true,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/marhey/Marhey%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Mada",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/mada/Mada%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Lalezar",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lalezar/Lalezar-Regular.ttf",
    },
    CuratedDef {
        family: "Lemonada",
        category: "display",
        is_arabic: true,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lemonada/Lemonada%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Markazi Text",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/markazitext/MarkaziText%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Kufam",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/kufam/Kufam%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Lateef",
        category: "serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lateef/Lateef-Regular.ttf",
    },
    CuratedDef {
        family: "Scheherazade New",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/scheherazadenew/ScheherazadeNew-Regular.ttf",
    },
    CuratedDef {
        family: "Harmattan",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/harmattan/Harmattan-Regular.ttf",
    },
    CuratedDef {
        family: "Mirza",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/mirza/Mirza-Regular.ttf",
    },
    CuratedDef {
        family: "Rakkas",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/rakkas/Rakkas-Regular.ttf",
    },
    CuratedDef {
        family: "Katibeh",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/katibeh/Katibeh-Regular.ttf",
    },
    CuratedDef {
        family: "Jomhuria",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/jomhuria/Jomhuria-Regular.ttf",
    },
    CuratedDef {
        family: "Vazirmatn",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/vazirmatn/Vazirmatn%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Cairo Play",
        category: "display",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cairoplay/CairoPlay%5Bslnt%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Amiri Quran",
        category: "serif",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/amiriquran/AmiriQuran-Regular.ttf",
    },
    CuratedDef {
        family: "Gulzar",
        category: "serif",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/gulzar/Gulzar-Regular.ttf",
    },
    CuratedDef {
        family: "Qahiri",
        category: "sans-serif",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/qahiri/Qahiri-Regular.ttf",
    },
    CuratedDef {
        family: "Vibes",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/vibes/Vibes-Regular.ttf",
    },
    CuratedDef {
        family: "Blaka",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/blaka/Blaka-Regular.ttf",
    },
    CuratedDef {
        family: "Blaka Hollow",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/blakahollow/BlakaHollow-Regular.ttf",
    },
    CuratedDef {
        family: "Blaka Ink",
        category: "display",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/blakaink/BlakaInk-Regular.ttf",
    },
    CuratedDef {
        family: "Alkalami",
        category: "serif",
        is_arabic: true,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/alkalami/Alkalami-Regular.ttf",
    },
    CuratedDef {
        family: "Ruwudu",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ruwudu/Ruwudu-Regular.ttf",
    },
    CuratedDef {
        family: "Noto Nastaliq Urdu",
        category: "serif",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notonastaliqurdu/NotoNastaliqUrdu%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Baloo Bhaijaan 2",
        category: "display",
        is_arabic: true,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/baloobhaijaan2/BalooBhaijaan2%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Handjet",
        category: "display",
        is_arabic: true,
        variants: &["Thin", "Light", "Regular", "Medium", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/handjet/Handjet%5BELGR%2CELSH%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Fustat",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fustat/Fustat%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Zain",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/zain/Zain-Regular.ttf",
    },
    CuratedDef {
        family: "Beiruti",
        category: "sans-serif",
        is_arabic: true,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/beiruti/Beiruti%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Lumanosimo",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lumanosimo/Lumanosimo-Regular.ttf",
    },
    CuratedDef {
        family: "Geist",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/geist/Geist%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Geist Mono",
        category: "monospace",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/geistmono/GeistMono%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Onest",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/onest/Onest%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Parkinsans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/parkinsans/Parkinsans%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Funnel Display",
        category: "display",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/funneldisplay/FunnelDisplay%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Young Serif",
        category: "serif",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/youngserif/YoungSerif-Regular.ttf",
    },

    // =========================================================================
    // 02 - English / Latin Google Fonts (78 Top Families)
    // =========================================================================
    CuratedDef {
        family: "Inter",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Roboto",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Open Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/opensans/OpenSans%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Montserrat",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Poppins",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Regular.ttf",
    },
    CuratedDef {
        family: "Lato",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lato/Lato-Regular.ttf",
    },
    CuratedDef {
        family: "Outfit",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/Outfit%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Plus Jakarta Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Manrope",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "DM Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Space Grotesk",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Syne",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/syne/Syne%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Urbanist",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/urbanist/Urbanist%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Lexend",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lexend/Lexend%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Work Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/worksans/WorkSans%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Nunito",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/nunito/Nunito%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Nunito Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/nunitosans/NunitoSans%5BYTLC%2Copsz%2Cwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Raleway",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/raleway/Raleway%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Rubik",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/rubik/Rubik%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Oswald",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Quicksand",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/quicksand/Quicksand%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Barlow",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/barlow/Barlow-Regular.ttf",
    },
    CuratedDef {
        family: "Barlow Condensed",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Regular.ttf",
    },
    CuratedDef {
        family: "Mulish",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/mulish/Mulish%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Karla",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/karla/Karla%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Cabin",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cabin/Cabin%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Josefin Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/josefinsans/JosefinSans%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Ubuntu",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ufl/ubuntu/Ubuntu-Regular.ttf",
    },
    CuratedDef {
        family: "Fira Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/firasans/FiraSans-Regular.ttf",
    },
    CuratedDef {
        family: "PT Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Regular", "Italic", "Bold", "BoldItalic"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ptsans/PTSans-Regular.ttf",
    },
    CuratedDef {
        family: "Source Sans 3",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Titillium Web",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/titilliumweb/TitilliumWeb-Regular.ttf",
    },
    CuratedDef {
        family: "Heebo",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/heebo/Heebo%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Kanit",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/kanit/Kanit-Regular.ttf",
    },
    CuratedDef {
        family: "Hind",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/hind/Hind-Regular.ttf",
    },
    CuratedDef {
        family: "Asap",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/asap/Asap%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Archivo",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Exo 2",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/Exo2%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Public Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/publicsans/PublicSans%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Red Hat Display",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/redhatdisplay/RedHatDisplay%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Figtree",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/Figtree%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Sora",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sora/Sora%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Be Vietnam Pro",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bevietnampro/BeVietnamPro-Regular.ttf",
    },
    CuratedDef {
        family: "Jost",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/jost/Jost%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "League Spartan",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/leaguespartan/LeagueSpartan%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Bricolage Grotesque",
        category: "sans-serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Instrument Sans",
        category: "sans-serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf",
    },

    // --- Latin Serif ---
    CuratedDef {
        family: "Playfair Display",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Merriweather",
        category: "serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather-Regular.ttf",
    },
    CuratedDef {
        family: "Lora",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "PT Serif",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Italic", "Bold", "BoldItalic"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ptserif/PTSerif-Regular.ttf",
    },
    CuratedDef {
        family: "Noto Serif",
        category: "serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "EB Garamond",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Libre Baskerville",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Italic", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/librebaskerville/LibreBaskerville-Regular.ttf",
    },
    CuratedDef {
        family: "Cormorant Garamond",
        category: "serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf",
    },
    CuratedDef {
        family: "Bitter",
        category: "serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bitter/Bitter%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Crimson Text",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/crimsontext/CrimsonText-Regular.ttf",
    },
    CuratedDef {
        family: "DM Serif Display",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Italic"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf",
    },
    CuratedDef {
        family: "Cinzel",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Fraunces",
        category: "serif",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Spectral",
        category: "serif",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/spectral/Spectral-Regular.ttf",
    },
    CuratedDef {
        family: "Alegreya",
        category: "serif",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/alegreya/Alegreya%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Zilla Slab",
        category: "serif",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/zillaslab/ZillaSlab-Regular.ttf",
    },

    // --- Latin Display & Handwriting ---
    CuratedDef {
        family: "Bebas Neue",
        category: "display",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf",
    },
    CuratedDef {
        family: "Anton",
        category: "display",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf",
    },
    CuratedDef {
        family: "Abril Fatface",
        category: "display",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/abrilfatface/AbrilFatface-Regular.ttf",
    },
    CuratedDef {
        family: "Righteous",
        category: "display",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/righteous/Righteous-Regular.ttf",
    },
    CuratedDef {
        family: "Comfortaa",
        category: "display",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/comfortaa/Comfortaa%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Fredoka",
        category: "display",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Lobster",
        category: "display",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/lobster/Lobster-Regular.ttf",
    },
    CuratedDef {
        family: "Pacifico",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf",
    },
    CuratedDef {
        family: "Dancing Script",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Caveat",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Satisfy",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/apache/satisfy/Satisfy-Regular.ttf",
    },
    CuratedDef {
        family: "Great Vibes",
        category: "handwriting",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
    },

    // --- Monospace / Developer Fonts ---
    CuratedDef {
        family: "JetBrains Mono",
        category: "monospace",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Fira Code",
        category: "monospace",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/firacode/FiraCode%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Source Code Pro",
        category: "monospace",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sourcecodepro/SourceCodePro%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "IBM Plex Mono",
        category: "monospace",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf",
    },
    CuratedDef {
        family: "Space Mono",
        category: "monospace",
        is_arabic: false,
        variants: &["Regular", "Italic", "Bold", "BoldItalic"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/spacemono/SpaceMono-Regular.ttf",
    },
    CuratedDef {
        family: "Inconsolata",
        category: "monospace",
        is_arabic: false,
        variants: &["ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/inconsolata/Inconsolata%5Bwdth%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Roboto Mono",
        category: "monospace",
        is_arabic: false,
        variants: &["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/robotomono/RobotoMono%5Bwght%5D.ttf",
    },

    // =========================================================================
    // 03 - Symbols and Dingbats / Icon Fonts (6 Families)
    // =========================================================================
    CuratedDef {
        family: "Material Symbols Outlined",
        category: "symbols",
        is_arabic: false,
        variants: &["Regular", "Medium", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Material Symbols Rounded",
        category: "symbols",
        is_arabic: false,
        variants: &["Regular", "Medium", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsRounded%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Material Symbols Sharp",
        category: "symbols",
        is_arabic: false,
        variants: &["Regular", "Medium", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/MaterialSymbolsSharp%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Emoji",
        category: "symbols",
        is_arabic: false,
        variants: &["Light", "Regular", "Medium", "SemiBold", "Bold"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Sans Symbols",
        category: "symbols",
        is_arabic: false,
        variants: &["Thin", "Light", "Regular", "Medium", "SemiBold", "Bold", "Black"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssymbols/NotoSansSymbols%5Bwght%5D.ttf",
    },
    CuratedDef {
        family: "Noto Sans Symbols 2",
        category: "symbols",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssymbols2/NotoSansSymbols2-Regular.ttf",
    },
    CuratedDef {
        family: "Noto Sans Math",
        category: "symbols",
        is_arabic: false,
        variants: &["Regular"],
        download_url: "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansmath/NotoSansMath-Regular.ttf",
    },
];

impl GoogleFontsManager {
    pub const GOOGLE_METADATA_URL: &'static str = "https://fonts.google.com/metadata/fonts";

    /// Returns `%APPDATA%/Fontivo/google-fonts-catalog.json` (or app data dir on non-Windows)
    pub fn get_catalog_cache_path() -> PathBuf {
        let dir = crate::engine::lifecycle::get_app_data_dir();
        let _ = fs::create_dir_all(&dir);
        dir.join("google-fonts-catalog.json")
    }

    fn normalize_google_category(raw: &str) -> String {
        match raw.trim().to_ascii_lowercase().as_str() {
            "sans serif" | "sans-serif" => "sans-serif".to_string(),
            "serif" => "serif".to_string(),
            "display" => "display".to_string(),
            "handwriting" => "handwriting".to_string(),
            "monospace" => "monospace".to_string(),
            "symbols" => "symbols".to_string(),
            other => other.replace(' ', "-"),
        }
    }

    fn variant_key_to_label(key: &str) -> (u16, bool, String) {
        let is_italic = key.ends_with('i');
        let num_str = key.trim_end_matches('i');
        let weight: u16 = num_str.parse().unwrap_or(400);
        let base = match weight {
            100 => "Thin",
            200 => "ExtraLight",
            300 => "Light",
            400 => "Regular",
            500 => "Medium",
            600 => "SemiBold",
            700 => "Bold",
            800 => "ExtraBold",
            900 => "Black",
            _ => "Regular",
        };
        let label = if is_italic {
            if weight == 400 {
                "Italic".to_string()
            } else {
                format!("{}Italic", base)
            }
        } else {
            base.to_string()
        };
        (weight, is_italic, label)
    }

    /// Parses raw response from `https://fonts.google.com/metadata/fonts`,
    /// stripping the leading `)]}'\n` XSSI protection prefix if present.
    pub fn parse_metadata_json(raw: &str) -> Result<Vec<GoogleFontEntry>, String> {
        let clean = raw
            .trim_start_matches('\u{feff}')
            .trim_start()
            .strip_prefix(")]}'")
            .unwrap_or(raw.trim_start_matches('\u{feff}'))
            .trim();

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct MetadataRoot {
            #[serde(default)]
            family_metadata_list: Vec<MetadataFamily>,
        }

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct MetadataFamily {
            family: String,
            #[serde(default)]
            category: String,
            #[serde(default)]
            subsets: Vec<String>,
            #[serde(default)]
            fonts: HashMap<String, serde_json::Value>,
            #[serde(default)]
            axes: Vec<serde_json::Value>,
            #[serde(default)]
            designers: Vec<String>,
            #[serde(default)]
            popularity: u32,
        }

        let root: MetadataRoot = serde_json::from_str(clean)
            .map_err(|e| format!("Failed to parse Google Fonts metadata JSON: {}", e))?;

        if root.family_metadata_list.is_empty() {
            return Err("Google Fonts metadata returned 0 families".to_string());
        }

        let curated_map: HashMap<String, &str> = CURATED_GOOGLE_FONTS
            .iter()
            .map(|c| (c.family.to_ascii_lowercase(), c.download_url))
            .collect();

        let storage_dir = Self::get_storage_dir();
        let lib_google_dir = crate::engine::downloader::LibraryStorageManager::get_google_dir();

        let mut entries: Vec<GoogleFontEntry> = root
            .family_metadata_list
            .into_iter()
            .map(|mf| {
                let is_arabic = mf.subsets.iter().any(|s| s.eq_ignore_ascii_case("arabic"));
                let is_latin = mf
                    .subsets
                    .iter()
                    .any(|s| s.eq_ignore_ascii_case("latin") || s.eq_ignore_ascii_case("latin-ext"));
                let is_variable = !mf.axes.is_empty();
                let category = Self::normalize_google_category(&mf.category);

                let mut parsed_variants: Vec<(u16, bool, String)> = mf
                    .fonts
                    .keys()
                    .map(|k| Self::variant_key_to_label(k))
                    .collect();
                if parsed_variants.is_empty() {
                    parsed_variants.push((400, false, "Regular".to_string()));
                }
                parsed_variants.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
                let variants: Vec<String> = parsed_variants.into_iter().map(|v| v.2).collect();

                let slug = mf
                    .family
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .collect::<String>()
                    .to_ascii_lowercase();
                let pascal = mf
                    .family
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .collect::<String>();
                let download_url = curated_map
                    .get(&mf.family.to_ascii_lowercase())
                    .map(|u| (*u).to_string())
                    .unwrap_or_else(|| {
                        format!(
                            "https://raw.githubusercontent.com/google/fonts/main/ofl/{}/{}-Regular.ttf",
                            slug, pascal
                        )
                    });

                let fname = format!("{}.ttf", mf.family.replace(' ', "_"));
                let is_downloaded =
                    storage_dir.join(&fname).exists() || lib_google_dir.join(&fname).exists();

                GoogleFontEntry {
                    family: mf.family,
                    category,
                    is_arabic,
                    is_latin,
                    is_variable,
                    subsets: mf.subsets,
                    designers: mf.designers,
                    popularity: mf.popularity,
                    variants,
                    download_url,
                    is_downloaded,
                    is_active: false,
                }
            })
            .collect();

        entries.sort_by(|a, b| {
            let pa = if a.popularity == 0 {
                u32::MAX
            } else {
                a.popularity
            };
            let pb = if b.popularity == 0 {
                u32::MAX
            } else {
                b.popularity
            };
            pa.cmp(&pb).then_with(|| a.family.cmp(&b.family))
        });

        Ok(entries)
    }

    /// Returns the FULL live Google Fonts catalog (1,700+ families, 10,000+ styles)
    /// from `https://fonts.google.com/metadata/fonts`, cached in memory and at
    /// `%APPDATA%/Fontivo/google-fonts-catalog.json`, with clean offline fallback.
    pub fn get_full_catalog(force_refresh: bool) -> (Vec<GoogleFontEntry>, String) {
        let mem_cache = GOOGLE_CATALOG_CACHE.get_or_init(|| RwLock::new(None));
        if !force_refresh {
            if let Ok(guard) = mem_cache.read() {
                if let Some((ts, list, src)) = guard.as_ref() {
                    if ts.elapsed() < GOOGLE_CATALOG_MEM_TTL && !list.is_empty() {
                        return (list.clone(), src.clone());
                    }
                }
            }
        }

        let cache_path = Self::get_catalog_cache_path();

        // Check fresh disk cache (< 24 hours) unless force_refresh is requested
        if !force_refresh && cache_path.exists() {
            if let Ok(meta) = fs::metadata(&cache_path) {
                if let Ok(modified) = meta.modified() {
                    if let Ok(age) = SystemTime::now().duration_since(modified) {
                        if age < GOOGLE_CATALOG_DISK_TTL {
                            if let Ok(content) = fs::read_to_string(&cache_path) {
                                if let Ok(cached_entries) =
                                    serde_json::from_str::<Vec<GoogleFontEntry>>(&content)
                                {
                                    if cached_entries.len() >= 100 {
                                        if let Ok(mut guard) = mem_cache.write() {
                                            *guard = Some((
                                                Instant::now(),
                                                cached_entries.clone(),
                                                "disk_cache".to_string(),
                                            ));
                                        }
                                        return (cached_entries, "disk_cache".to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Fetch live from Google Fonts metadata endpoint
        let agent = ureq::builder()
            .timeout_connect(Duration::from_secs(5))
            .timeout_read(Duration::from_secs(10))
            .redirects(3)
            .build();

        if let Ok(resp) = agent.get(Self::GOOGLE_METADATA_URL).call() {
            if let Ok(body) = resp.into_string() {
                if let Ok(entries) = Self::parse_metadata_json(&body) {
                    if let Ok(json_out) = serde_json::to_string(&entries) {
                        let _ = fs::write(&cache_path, json_out);
                    }
                    if let Ok(mut guard) = mem_cache.write() {
                        *guard = Some((Instant::now(), entries.clone(), "google_live".to_string()));
                    }
                    return (entries, "google_live".to_string());
                }
            }
        }

        // Offline fallback 1: stale disk cache if available
        if cache_path.exists() {
            if let Ok(content) = fs::read_to_string(&cache_path) {
                if let Ok(cached_entries) = serde_json::from_str::<Vec<GoogleFontEntry>>(&content) {
                    if !cached_entries.is_empty() {
                        return (cached_entries, "stale_disk_cache".to_string());
                    }
                }
            }
        }

        // Offline fallback 2: built-in curated catalog
        (Self::get_curated_catalog(), "curated_offline".to_string())
    }

    /// Parses `(weight, is_italic)` from a PostScript name (e.g. `"Poppins-BlackItalic"`,
    /// `"Raleway-ExtraBold"`) or style label (e.g. `"Black Italic"`, `"Thin"`).
    /// When a hyphen is present (PostScript format), only the style segment after the
    /// last hyphen is inspected so family names like `"Black Ops One"` do not mis-classify.
    pub fn parse_style_weight_italic(raw: &str) -> (u16, bool) {
        let trimmed = raw.trim();
        let style_part = if let Some(idx) = trimmed.rfind('-') {
            &trimmed[idx + 1..]
        } else {
            trimmed
        };

        let compact: String = style_part
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();

        let is_italic = compact.contains("italic")
            || compact.contains("oblique")
            || compact.ends_with("ital")
            || compact == "it";

        // Strip italic/oblique tokens before weight detection
        let weight_tok = compact
            .replace("italic", "")
            .replace("oblique", "")
            .replace("ital", "");

        let weight = if weight_tok.contains("extrabold")
            || weight_tok.contains("ultrabold")
            || weight_tok.contains("xbold")
        {
            800
        } else if weight_tok.contains("semibold")
            || weight_tok.contains("demibold")
            || weight_tok.contains("demi")
        {
            600
        } else if weight_tok.contains("extralight")
            || weight_tok.contains("ultralight")
            || weight_tok.contains("xlight")
        {
            200
        } else if weight_tok.contains("black")
            || weight_tok.contains("heavy")
            || weight_tok.contains("ultra")
            || weight_tok.contains("poster")
        {
            900
        } else if weight_tok.contains("bold") {
            700
        } else if weight_tok.contains("medium") || weight_tok.contains("med") {
            500
        } else if weight_tok.contains("light") {
            300
        } else if weight_tok.contains("thin") || weight_tok.contains("hairline") {
            100
        } else {
            400
        };

        (weight, is_italic)
    }

    pub fn fetch_ttf_url_from_css2(css_url: &str) -> Option<String> {
        let agent = ureq::builder()
            .timeout_connect(Duration::from_secs(4))
            .timeout_read(Duration::from_secs(6))
            .redirects(3)
            .build();

        // Use a legacy Safari / webkit UA that cannot decompress WOFF2, forcing Google Fonts to output TTF format
        let resp = agent
            .get(css_url)
            .set(
                "User-Agent",
                "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
            )
            .call()
            .ok()?;
        let css = resp.into_string().ok()?;
        let start = css.find("https://fonts.gstatic.com/")?;
        let tail = &css[start..];
        let end = tail.find(')')?;
        let candidate = tail[..end].trim().trim_matches('\'').trim_matches('"');
        if candidate.ends_with(".ttf") || candidate.ends_with(".otf") {
            Some(candidate.to_string())
        } else {
            None
        }
    }

    /// Resolves a direct `.ttf` download URL for a specific weight & italic style
    /// of a Google Font family (e.g. `("Poppins", "Poppins-BlackItalic")` -> `ital,wght@1,900`).
    /// This ensures Photoshop/Illustrator receive the EXACT PostScript weight/style in RAM.
    pub fn resolve_download_url_for_style(family: &str, raw_name_or_style: &str) -> String {
        let (weight, is_italic) = Self::parse_style_weight_italic(raw_name_or_style);

        // 1. Direct GitHub ofl style matching (e.g. Poppins-BlackItalic.ttf, Raleway-ExtraBold.ttf)
        let slug: String = family
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        let clean_raw = raw_name_or_style.trim();
        if !clean_raw.is_empty() && clean_raw.contains('-') {
            let gh_url = format!(
                "https://raw.githubusercontent.com/google/fonts/main/ofl/{}/{}.ttf",
                slug, clean_raw
            );
            if let Ok(head_resp) = ureq::head(&gh_url).timeout(Duration::from_secs(2)).call() {
                if head_resp.status() == 200 {
                    return gh_url;
                }
            }
        }

        if weight == 400 && !is_italic {
            return Self::resolve_download_url(family);
        }

        let encoded_family = family.trim().replace(' ', "+");
        let ital_flag = if is_italic { 1 } else { 0 };

        // 2. Try explicit ital,wght axis (works for families with italic axis like Poppins, Raleway, Roboto)
        let ital_wght_url = format!(
            "https://fonts.googleapis.com/css2?family={}:ital,wght@{},{}",
            encoded_family, ital_flag, weight
        );
        if let Some(url) = Self::fetch_ttf_url_from_css2(&ital_wght_url) {
            return url;
        }

        // 3. Try legacy CSS1 format which reliably outputs TTF for specific styles (e.g. Poppins:900italic)
        let css1_style = if is_italic {
            format!("{}italic", weight)
        } else {
            format!("{}", weight)
        };
        let css1_url = format!(
            "https://fonts.googleapis.com/css?family={}:{}",
            encoded_family, css1_style
        );
        if let Some(url) = Self::fetch_ttf_url_from_css2(&css1_url) {
            return url;
        }

        // 4. For upright styles on families without an italic axis (e.g. Cairo, Tajawal, IBM Plex Sans Arabic)
        if !is_italic {
            let wght_url = format!(
                "https://fonts.googleapis.com/css2?family={}:wght@{}",
                encoded_family, weight
            );
            if let Some(url) = Self::fetch_ttf_url_from_css2(&wght_url) {
                return url;
            }
        }

        // 5. Fallback to base family Regular
        Self::resolve_download_url(family)
    }

    /// Resolves a direct `.ttf` download URL for ANY Google Font family,
    /// using the curated map first and falling back to Google Fonts CSS2 API.
    pub fn resolve_download_url(family: &str) -> String {
        if let Some(curated) = CURATED_GOOGLE_FONTS
            .iter()
            .find(|c| c.family.eq_ignore_ascii_case(family))
        {
            return curated.download_url.to_string();
        }

        // Query Google Fonts CSS2 API with a legacy UA so it returns a direct .ttf URL
        let encoded_family = family.trim().replace(' ', "+");
        let css_url = format!(
            "https://fonts.googleapis.com/css2?family={}",
            encoded_family
        );
        if let Some(url) = Self::fetch_ttf_url_from_css2(&css_url) {
            return url;
        }

        let slug: String = family
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        let pascal: String = family
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect();
        format!(
            "https://raw.githubusercontent.com/google/fonts/main/ofl/{}/{}-Regular.ttf",
            slug, pascal
        )
    }

    /// Returns the built-in curated catalog of 125+ top Arabic, Latin, and Symbol Google Fonts
    pub fn get_curated_catalog() -> Vec<GoogleFontEntry> {
        let storage_dir = Self::get_storage_dir();
        let lib_google_dir = crate::engine::downloader::LibraryStorageManager::get_google_dir();

        CURATED_GOOGLE_FONTS
            .iter()
            .enumerate()
            .map(|(idx, def)| {
                let fname = format!("{}.ttf", def.family.replace(' ', "_"));
                let is_downloaded =
                    storage_dir.join(&fname).exists() || lib_google_dir.join(&fname).exists();
                let is_variable =
                    def.download_url.contains("%5B") || def.download_url.contains('[');
                let is_latin = def.category != "symbols";
                let mut subsets = Vec::new();
                if def.is_arabic {
                    subsets.push("arabic".to_string());
                }
                if is_latin {
                    subsets.push("latin".to_string());
                }
                GoogleFontEntry {
                    family: def.family.to_string(),
                    category: def.category.to_string(),
                    is_arabic: def.is_arabic,
                    is_latin,
                    is_variable,
                    subsets,
                    designers: Vec::new(),
                    popularity: (idx + 1) as u32,
                    variants: def.variants.iter().map(|v| (*v).to_string()).collect(),
                    download_url: def.download_url.to_string(),
                    is_downloaded,
                    is_active: false,
                }
            })
            .collect()
    }

    /// Generates `FontRecord` items from the curated Google Fonts catalog so the library
    /// works out-of-the-box centered on Google Fonts without requiring a static `fonts-cache.json`.
    pub fn build_curated_font_records(start_id: usize) -> Vec<FontRecord> {
        let storage_dir = Self::get_storage_dir();
        let lib_google_dir = crate::engine::downloader::LibraryStorageManager::get_google_dir();

        // Optional local system/sample fallback font so out-of-the-box records can also resolve
        // if already downloaded in GoogleFonts
        let mut records = Vec::new();
        let mut next_id = start_id;

        for def in CURATED_GOOGLE_FONTS {
            let category_label = if def.is_arabic {
                "01 - Arabic Fonts".to_string()
            } else if def.category == "symbols" {
                "03 - Symbols and Dingbats".to_string()
            } else {
                "02 - English Fonts".to_string()
            };

            let safe_fam = def.family.replace(' ', "_");
            let base_file_name = format!("{}.ttf", safe_fam);
            let candidate_a = lib_google_dir.join(&base_file_name);
            let candidate_b = storage_dir.join(&base_file_name);

            let (resolved_base_path, exists_on_disk, disk_size) = if candidate_a.exists() {
                let sz = fs::metadata(&candidate_a)
                    .map(|m| m.len() as usize)
                    .unwrap_or(148_000);
                (candidate_a, true, sz)
            } else if candidate_b.exists() {
                let sz = fs::metadata(&candidate_b)
                    .map(|m| m.len() as usize)
                    .unwrap_or(148_000);
                (candidate_b, true, sz)
            } else {
                (candidate_a, false, 148_000)
            };

            for (v_idx, &variant) in def.variants.iter().enumerate() {
                let variant_file_name = format!("{}-{}.ttf", def.family.replace(' ', ""), variant);
                let display_name = if variant == "Regular" {
                    def.family.to_string()
                } else {
                    format!("{} {}", def.family, variant)
                };
                let post_script = format!("{}-{}", def.family.replace(' ', ""), variant);

                let variant_cand = lib_google_dir.join(&variant_file_name);
                let (record_path, is_local, size) = if variant_cand.exists() {
                    let sz = fs::metadata(&variant_cand)
                        .map(|m| m.len() as usize)
                        .unwrap_or(148_000);
                    (variant_cand.to_string_lossy().to_string(), true, sz)
                } else if exists_on_disk {
                    (
                        resolved_base_path.to_string_lossy().to_string(),
                        true,
                        disk_size,
                    )
                } else {
                    (
                        lib_google_dir
                            .join(&variant_file_name)
                            .to_string_lossy()
                            .to_string(),
                        false,
                        142_000 + (v_idx * 4_500),
                    )
                };

                let glyph_count = if def.is_arabic {
                    680
                } else if def.category == "symbols" {
                    1240
                } else {
                    520
                };

                let is_variable =
                    def.download_url.contains("%5B") || def.download_url.contains('[');
                let is_latin = def.category != "symbols";
                let is_bilingual = def.is_arabic && is_latin;
                let weight = style_to_weight(Some(variant));

                records.push(FontRecord {
                    id: next_id,
                    name: variant_file_name,
                    path: record_path,
                    category: category_label.clone(),
                    sub_category: Some("Google Fonts".to_string()),
                    family: Some(def.family.to_string()),
                    format: "TTF".to_string(),
                    size,
                    is_arabic: def.is_arabic,
                    is_latin,
                    is_bilingual,
                    is_variable,
                    weight,
                    source: "google".to_string(),
                    is_active: false,
                    is_favorite: false,
                    display_name: Some(display_name),
                    style: Some(variant.to_string()),
                    post_script_name: Some(post_script),
                    glyph_count: Some(glyph_count),
                    has_tashkeel: def.is_arabic,
                    has_extended_arabic: def.is_arabic,
                    has_arabic_numerals: def.is_arabic,
                    has_western_numerals: true,
                    is_local,
                });
                next_id += 1;
            }
        }

        records
    }

    /// Gets local storage path for downloaded Google fonts (`<LibraryDir>\GoogleFonts`)
    pub fn get_storage_dir() -> PathBuf {
        crate::engine::downloader::storage::LibraryStorageManager::get_google_dir()
    }

    /// Checks whether a given Google Font family is downloaded locally on disk
    pub fn is_family_downloaded(family: &str) -> Option<PathBuf> {
        let fname = format!("{}.ttf", family.replace(' ', "_"));
        let p1 = Self::get_storage_dir().join(&fname);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = crate::engine::downloader::LibraryStorageManager::get_google_dir().join(&fname);
        if p2.exists() {
            return Some(p2);
        }
        None
    }

    /// Downloads a font by family name safely
    pub fn download_font(family: &str) -> Result<PathBuf, String> {
        let catalog = Self::get_curated_catalog();
        let item = catalog
            .iter()
            .find(|f| f.family.eq_ignore_ascii_case(family))
            .ok_or_else(|| format!("Font '{}' not found in Google catalog", family))?;

        let dir = Self::get_storage_dir();
        let target_path =
            crate::server::security::resolve_safe_font_path(&dir, &item.family, "ttf")
                .map_err(|e| format!("Security validation error: {}", e))?;

        if target_path.exists() && Path::new(&target_path).is_file() {
            return Ok(target_path);
        }

        let effective_url = if item.download_url.contains("/apache/roboto/") {
            item.download_url.replace("/apache/roboto/", "/ofl/roboto/")
        } else {
            item.download_url.clone()
        };

        let mut dl_result = crate::server::security::safe_download_font_bytes(&effective_url);
        if dl_result.is_err() {
            let alt_url = if effective_url.contains("/apache/") {
                Some(effective_url.replace("/apache/", "/ofl/"))
            } else if effective_url.contains("/ofl/") {
                Some(effective_url.replace("/ofl/", "/apache/"))
            } else {
                None
            };
            if let Some(ref alt) = alt_url {
                if let Ok(alt_bytes) = crate::server::security::safe_download_font_bytes(alt) {
                    dl_result = Ok(alt_bytes);
                }
            }
        }
        if dl_result.is_err() {
            let css_url = format!(
                "https://fonts.googleapis.com/css2?family={}",
                family.replace(' ', "+")
            );
            if let Some(dyn_url) = Self::fetch_ttf_url_from_css2(&css_url) {
                if let Ok(dyn_bytes) = crate::server::security::safe_download_font_bytes(&dyn_url) {
                    dl_result = Ok(dyn_bytes);
                }
            }
        }

        let bytes = dl_result.map_err(|e| format!("Safe download error: {}", e))?;

        fs::write(&target_path, bytes).map_err(|e| format!("Failed to save font bytes: {}", e))?;

        Ok(target_path)
    }
}
