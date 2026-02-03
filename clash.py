
import utils
import os

def to_file(rules_collection: dict):
    output_dir = 'output/clash/'
    utils.ensure_dir(output_dir)
    for set_name, rules in rules_collection.items():
        ruleset_path = os.path.join(output_dir, f"{set_name}.list")
        with open(ruleset_path, 'w') as f:
            f.write("payload:\n")
            for domain in rules["domain"]:
                f.write(f"  - DOMAIN,{domain}\n")
            for suffix in rules["domain-suffix"]:
                f.write(f"  - DOMAIN-SUFFIX,{suffix}\n")
            for rule in rules["ipcidr"]:
                if "/" not in rule:
                    rule += "/32"
                f.write(f"  - IP-CIDR,{rule}\n")
            for keyword in rules["domain-keyword"]:
                f.write(f"  - DOMAIN-KEYWORD,{keyword}\n")
            for dest_port in rules["dest-port"]:
                f.write(f"  - DST-PORT,{dest_port}\n")