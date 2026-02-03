
import utils
import os

def get_rules(data: str) -> dict[str, list[str]]:
    parsed = utils.parse(data)
    rules_dict = utils.empty_rules_dict()
    for line in parsed:
        rule_type, content = line.split(",")[:2]
        if rule_type == "IP-CIDR":
            rules_dict["ipcidr"].append(content.strip())
        elif rule_type == "DOMAIN":
            rules_dict["domain"].append(content.strip())
        elif rule_type == "DOMAIN-KEYWORD":
            rules_dict["domain-keyword"].append(content.strip())
        elif rule_type == "DOMAIN-SUFFIX":
            rules_dict["domain-suffix"].append(content.strip())
        elif rule_type == "DEST-PORT":
            rules_dict["dest-port"].append(content.strip())
    return rules_dict

def to_file(rules_collection: dict):
    output_dir = 'output/surge/'
    utils.ensure_dir(output_dir)
    for set_name, rules in rules_collection.items():
        ruleset_path = os.path.join(output_dir, f"{set_name}.list")
        with open(ruleset_path, 'w') as f:
            for domain in rules["domain"]:
                f.write(f"DOMAIN,{domain}\n")
            for suffix in rules["domain-suffix"]:
                f.write(f"DOMAIN-SUFFIX,{suffix}\n")
            for keyword in rules["domain-keyword"]:
                f.write(f"DOMAIN-KEYWORD,{keyword}\n")
            for rule in rules["ipcidr"]:
                if "/" not in rule:
                    rule += "/32"
                f.write(f"IP-CIDR,{rule}\n")
            for dest_port in rules["dest-port"]:
                f.write(f"DEST-PORT,{dest_port}\n")