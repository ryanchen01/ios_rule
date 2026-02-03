import requests
import json
import utils
import v2ray
import surge
import clash

def add_rules(rules_collection: dict, set_name: str, rules: dict[str, list[str]]):
    if set_name not in rules_collection:
        rules_collection[set_name] = {
            "ipcidr": [],
            "domain": [],
            "domain-keyword": [],
            "domain-suffix": [],
            "dest-port": []
        }
    rules_collection[set_name]["ipcidr"].extend(rules.get("ipcidr", []))
    rules_collection[set_name]["domain"].extend(rules.get("domain", []))
    rules_collection[set_name]["domain-keyword"].extend(rules.get("domain-keyword", []))
    rules_collection[set_name]["domain-suffix"].extend(rules.get("domain-suffix", []))
    rules_collection[set_name]["dest-port"].extend(rules.get("dest-port", []))
    return rules_collection

def main():
    with open('sources.json', 'r') as f:
        sources = json.load(f)
    rules_collection = {}
    for source in sources:
        response = requests.get(source['url'])
        if response.status_code == 200:
            data = response.text
        else:
            print(f"Failed to fetch data from {source['url']} with status code {response.status_code}")
            continue
        if source['type'] == 'v2ray':
            rules = v2ray.get_rules(data)
        elif source['type'] == 'surge':
            rules = surge.get_rules(data)
        
        rules_collection = add_rules(rules_collection, source['set'], rules)
    
    with open('extras.json', 'r') as f:
        extras = json.load(f)
    for extra in extras:
        rules_collection = add_rules(rules_collection, extra['set'], extra['rules'])

    rules_collection = utils.remove_duplicates(rules_collection)
    surge.to_file(rules_collection)
    clash.to_file(rules_collection)
if __name__ == "__main__":
    main()
