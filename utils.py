import os

def ensure_dir(file_path: str):
    directory = os.path.dirname(file_path)
    if not os.path.exists(directory):
        os.makedirs(directory)

def parse(data: str) -> list[str]:
    lines = data.splitlines()
    parsed = [line for line in lines if line and not line.startswith('#')]
    return parsed

def remove_duplicates(rules_collection: dict) -> dict[str, list[str]]:
    for set_name, rules in rules_collection.items():
        for rule_type in rules:
            rules_collection[set_name][rule_type] = sorted(list(set(rules[rule_type])))
    return rules_collection

def empty_rules_dict() -> dict[str, list[str]]:
    return {
        "ipcidr": [],
        "domain": [],
        "domain-keyword": [],
        "domain-suffix": [],
        "dest-port": []
    }