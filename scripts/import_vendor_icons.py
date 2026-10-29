"""Import the official cloud architecture icon sets into map-viewer/vendor/.

    python3 scripts/import_vendor_icons.py --aws <zip> --azure <zip> --gcp <zip> [<zip> ...]

Reads the vendors' downloads as they come (zip files, never extracted to disk) and
keeps only SVGs, one size per icon, byte for byte (the vendors' terms forbid changing
them). Writes map-viewer/vendor/<set>/... (with the set's NOTICE.md) and
map-viewer/vendor-icons.json, the one map from an icon name to its file that the
viewer and the checker both read. --notices rewrites only the notices.

A name is the product's name in lower-case words joined by hyphens, without the
vendor's own prefix (Amazon, AWS, Azure, Google Cloud): `aws ec2`, `azure
virtual-machine`, `gcp bigquery`. Names people already know from draw.io and the
Python diagrams package are aliases (ALIASES below). The same downloads always give
the same names. Standard library only, Python 3.9+.
"""
import argparse
import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "map-viewer" / "vendor"
INDEX = ROOT / "map-viewer" / "vendor-icons.json"

SOURCES = {
    "aws": {"title": "AWS Architecture Icons", "url": "https://aws.amazon.com/architecture/icons/"},
    "azure": {"title": "Azure architecture icons", "url": "https://learn.microsoft.com/azure/architecture/icons/"},
    "gcp": {"title": "Google Cloud icons", "url": "https://cloud.google.com/icons"},
}

# What each vendor says about using its icons, as checked on its icon page (and in the
# download) on TERMS_CHECKED. Short quotes only; the vendor's page has the full text.
# Check again when a new package is imported.
TERMS_CHECKED = "2026-10-28"
TERMS = {
    "aws": """\
On its icon page AWS lets customers and partners "use these toolkits and assets to
create architecture diagrams", and says the icons can also go in materials such as
whitepapers, presentations, data sheets and posters. The page gives no other licence
for the icons. AWS site terms: https://aws.amazon.com/terms/
""",
    "azure": """\
The "Icon terms" on Microsoft's icon page (also Microsoft_Terms_of_Use.pdf in the
download) say: "Microsoft permits the use of these icons in architectural diagrams,
training materials, or documentation." The icons may be copied, distributed and
displayed only for that use unless Microsoft grants explicit permission; Microsoft
reserves all other rights.

The same page asks that icons are not cropped, flipped, rotated, distorted or
reshaped, are used as they appear within Azure, are named near the icon, and are not
used to represent your own product or service.
""",
    "gcp": """\
Google's icon page offers these icons "for your diagrams, technical documentation, and
more". Neither the page nor its product icons guide (PDF) states a separate licence
for the icons. The page links Google's terms: https://cloud.google.com/product-terms
and https://policies.google.com/terms
""",
}

# alias -> name, for names people already write (draw.io shape names, the Python
# diagrams package). Only names that exist are written to the index.
ALIASES = {
    "aws": {
        "s3": "simple-storage-service", "sqs": "simple-queue-service", "sns": "simple-notification-service",
        "ses": "simple-email-service", "rds": "rds", "elb": "elastic-load-balancing", "alb": "elastic-load-balancing",
        "eks": "elastic-kubernetes-service", "ecs": "elastic-container-service", "ecr": "elastic-container-registry",
        "efs": "efs", "ebs": "elastic-block-store", "emr": "emr", "vpc": "virtual-private-cloud", "iam": "identity-and-access-management",
        "kms": "key-management-service", "waf": "waf", "apigateway": "api-gateway", "api": "api-gateway",
        "elasticache": "elasticache", "dynamo": "dynamodb", "stepfunctions": "step-functions", "sfn": "step-functions",
        "cloudwatch": "cloudwatch", "cloudfront": "cloudfront", "route53": "route-53", "cognito": "cognito",
        "secretsmanager": "secrets-manager", "kinesis": "kinesis", "msk": "managed-streaming-for-apache-kafka",
        "glue": "glue", "athena": "athena", "redshift": "redshift", "aurora": "aurora", "fargate": "fargate",
        "eventbridge": "eventbridge", "codepipeline": "codepipeline", "codebuild": "codebuild", "cloudformation": "cloudformation",
        "sagemaker": "sagemaker-ai", "bedrock": "bedrock", "opensearch": "opensearch-service", "autoscaling": "ec2-auto-scaling",
        "users": "users", "user": "user", "client": "client",
    },
    "azure": {
        "vm": "virtual-machine", "vms": "virtual-machine", "aks": "kubernetes-services", "kubernetes": "kubernetes-services",
        "functions": "function-apps", "function-app": "function-apps", "app-service": "app-services", "webapp": "app-services",
        "cosmos": "cosmos-db", "cosmosdb": "cosmos-db", "sql": "sql-database", "sql-databases": "sql-database",
        "blob": "storage-accounts", "storage": "storage-accounts", "storage-account": "storage-accounts",
        "keyvault": "key-vaults", "key-vault": "key-vaults", "vnet": "virtual-networks", "virtual-network": "virtual-networks",
        "service-bus": "service-bus", "event-hub": "event-hubs", "eventhub": "event-hubs", "event-grid": "event-grid-topics",
        "apim": "api-management-services", "api-management": "api-management-services", "front-door": "front-door-and-cdn-profiles",
        "cdn": "front-door-and-cdn-profiles", "app-gateway": "application-gateways", "application-gateway": "application-gateways",
        "load-balancer": "load-balancers", "lb": "load-balancers", "acr": "container-registries", "container-registry": "container-registries",
        "monitor": "monitor", "app-insights": "application-insights", "log-analytics": "log-analytics-workspaces",
        "redis": "cache-redis", "synapse": "synapse-analytics",
        "data-factory": "data-factories", "adf": "data-factories", "databricks": "databricks", "openai": "openai",
        "container-apps": "container-apps-environments", "logic-app": "logic-apps", "dns": "dns-zones", "firewall": "firewalls",
    },
    "gcp": {
        "gke": "gke", "kubernetes-engine": "gke", "run": "cloud-run", "gcs": "cloud-storage", "storage": "cloud-storage",
        "sql": "cloud-sql", "spanner": "cloud-spanner", "gce": "compute-engine", "compute": "compute-engine", "vm": "compute-engine",
        "vertex": "vertex-ai", "vertexai": "vertex-ai", "bq": "bigquery",
    },
}
VENDOR_PREFIX = {"aws": r"^(amazon|aws)-", "azure": r"^azure-", "gcp": r"^(google-cloud|google)-"}


def slug(text):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def label_of(text):
    return re.sub(r"\s+", " ", text.replace("-", " ").replace("_", " ")).strip()


def aws_dark(zf):
    """light icon's file name -> its _Dark twin's entry (general resource and group icons)."""
    out = {}
    for e in zf.namelist():
        base = e.rsplit("/", 1)[-1]
        if "__MACOSX" not in e and e.endswith("_Dark.svg"):
            out[base.replace("_48_Dark.svg", "_48_Light.svg").replace("_Dark.svg", ".svg")] = e
    return out


def aws_entries(zf):
    """(kind, label, entry) for one size of each AWS icon, SVG only."""
    for e in sorted(zf.namelist()):
        if "__MACOSX" in e or not e.endswith(".svg"):
            continue
        base = e.rsplit("/", 1)[-1][:-4]
        e_ = "/" + e
        if "/Architecture-Service-Icons_" in e_ and "/48/" in e:
            yield "service", label_of(re.sub(r"^Arch_|_48$", "", base)), e
        elif "/Resource-Icons_" in e_ and "_Dark" not in base:
            parts = re.sub(r"^Res_|_48(_Light)?$", "", base).split("_")
            if len(parts) > 1 and parts[1].startswith(parts[0]):
                parts = parts[1:]   # Res_Amazon-Aurora_Amazon-Aurora-Instance: the service once
            yield "resource", label_of(" ".join(parts)), e
        elif "/Architecture-Group-Icons_" in e_ and "_Dark" not in base:
            yield "group", label_of(re.sub(r"_32$", "", base)), e
        elif "/Arch-Category_48/" in e_:
            yield "category", label_of(re.sub(r"^Arch-Category_|_48$", "", base)), e


def azure_entries(zf):
    for e in sorted(zf.namelist()):
        if "__MACOSX" in e or not e.endswith(".svg") or "/Icons/" not in e:
            continue
        base = e.rsplit("/", 1)[-1][:-4]
        yield "service", label_of(re.sub(r"^\d+-icon-service-", "", base)), e


def gcp_entries(zf):
    for e in sorted(zf.namelist()):
        if "__MACOSX" in e or not e.endswith(".svg") or "/SVG/" not in e:
            continue
        product = e.split("/SVG/")[0].rsplit("/", 1)[-1]
        if "Unique Icons/" in e:
            yield "service", product, e
        elif "Category Icons/" in e:
            yield "category", product.replace(" _ ", " / "), e


SKIP = []   # terms the clean check forbids (scripts/check.sh): such icons are left out
KIND_ORDER = {"service": 0, "group": 1, "resource": 2, "category": 3}
READERS = {"aws": aws_entries, "azure": azure_entries, "gcp": gcp_entries}


def import_set(ns, zips):
    found = []
    for z in zips:
        with zipfile.ZipFile(z) as zf:
            darks = aws_dark(zf) if ns == "aws" else {}
            for kind, label, entry in READERS[ns](zf):
                twin = darks.get(entry.rsplit("/", 1)[-1])
                found.append((KIND_ORDER[kind], kind, label, entry, zf.read(entry), twin and (twin, zf.read(twin))))
    found.sort(key=lambda f: (f[0], f[3]))
    out = VENDOR / ns
    if out.exists():
        shutil.rmtree(out)
    icons, seen = {}, {}
    for _, kind, label, entry, data, dark in found:
        if any(t in entry.lower() or t in label.lower() for t in SKIP):
            continue
        digest = hashlib.sha1(data).hexdigest()
        if digest in seen:
            continue   # the same drawing listed again (Azure repeats icons across categories)
        name = re.sub(VENDOR_PREFIX[ns], "", slug(label))
        if kind == "category":
            name = f"category-{name}"
            label = f"{label} (category)"
        if name in icons:
            folder = slug(entry.split("/")[-2]) if ns == "azure" else kind
            name = f"{name}-{folder}" if f"{name}-{folder}" not in icons else f"{name}-{digest[:6]}"
        # file: the vendor's own file name, under its kind (and Azure's category)
        sub = entry.split("/")[-2] if ns == "azure" else kind
        rel = f"{ns}/{slug(sub)}/{entry.rsplit('/', 1)[-1]}"
        (VENDOR / rel).parent.mkdir(parents=True, exist_ok=True)
        (VENDOR / rel).write_bytes(data)
        icons[name] = [rel, label]
        if dark:   # drawn instead on a dark appearance
            drel = f"{ns}/{slug(sub)}/{dark[0].rsplit('/', 1)[-1]}"
            (VENDOR / drel).write_bytes(dark[1])
            icons[name].append(drel)
        seen[digest] = name
    aliases = {a: n for a, n in sorted(ALIASES[ns].items()) if n in icons and a not in icons}
    missing = sorted(a for a, n in ALIASES[ns].items() if n not in icons)
    if missing:
        print(f"{ns}: aliases without an icon (left out): {', '.join(missing)}", file=sys.stderr)
    package = sorted(Path(z).name for z in zips)
    return {**SOURCES[ns], "package": package, "icons": dict(sorted(icons.items())), "aliases": aliases}


def write_notice(ns, info):
    """vendor/<set>/NOTICE.md: where the icons came from and the vendor's terms."""
    package = ", ".join(f"`{z}`" for z in info.get("package", [])) or "the vendor's download"
    (VENDOR / ns / "NOTICE.md").write_text(f"""\
# {info['title']}

The icons in this folder are the {info['title']}, downloaded from the vendor's page
{info['url']} ({package}).

They are kept as the vendor published them: SVG files, one size per icon, byte for
byte, never changed. Avagahana uses them only in architecture diagrams, to stand for
the vendor's own products, drawn with the product's name.

These icons are not covered by Avagahana's MIT licence. They belong to the vendor and
are used under the vendor's terms.

## The vendor's terms

{TERMS[ns]}
Terms checked on {TERMS_CHECKED}; see {info['url']} for the current text.
Written by scripts/import_vendor_icons.py; do not edit by hand.
""")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    for ns in READERS:
        ap.add_argument(f"--{ns}", nargs="+", default=[], metavar="ZIP")
    ap.add_argument("--skip-terms", default=str(ROOT.parent / "work-orders" / "forbidden-terms.txt"),
                    help="leave out icons whose file or product name holds a term from this file "
                         "(one per line; the clean check's list by default)")
    ap.add_argument("--notices", action="store_true",
                    help="only rewrite vendor/<set>/NOTICE.md for the sets already imported")
    args = ap.parse_args()
    if args.notices:
        for ns, info in json.loads(INDEX.read_text())["sets"].items():
            write_notice(ns, info)
        return
    terms = Path(args.skip_terms)
    SKIP[:] = [t.strip().lower() for t in terms.read_text().splitlines() if t.strip()] if terms.is_file() else []
    old = json.loads(INDEX.read_text()) if INDEX.exists() else {"sets": {}}
    sets = dict(old.get("sets", {}))
    for ns in READERS:
        zips = getattr(args, ns)
        if zips:
            sets[ns] = import_set(ns, zips)
            write_notice(ns, sets[ns])
            print(f"{ns}: {len(sets[ns]['icons'])} icons, {len(sets[ns]['aliases'])} aliases")
    INDEX.write_text(json.dumps({
        "about": "Official cloud architecture icons: `<set> <name>` in ::icon lines, ## Node icons and "
                 "## Classes. Each name maps to a file under vendor/, used as the vendor published it, "
                 "for architecture diagrams under the vendor's terms (vendor/<set>/NOTICE.md). "
                 "Written by scripts/import_vendor_icons.py; do not edit by hand.",
        "sets": dict(sorted(sets.items())),
    }, indent=1) + "\n")


if __name__ == "__main__":
    main()
