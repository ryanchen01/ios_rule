import requests
import utils


def clean_content(data: str) -> str:
    return data.strip().split("@")[0].strip()

def get_rules(data: str) -> dict[str, list[str]]:
    parsed = utils.parse(data)
    url_prefix = "https://raw.githubusercontent.com/v2fly/domain-list-community/refs/heads/master/data/"
    rules_dict = utils.empty_rules_dict()
    
    for line in parsed:
        if ":" in line:
            tag, content = line.split(":", 1)
            if tag == "include":
                full_url = url_prefix + content
                response = requests.get(full_url)
                if response.status_code == 200:
                    included_data = get_rules(response.text)
                    rules_dict["ipcidr"].extend(included_data["ipcidr"])
                    rules_dict["domain"].extend(included_data["domain"])
                    rules_dict["domain-keyword"].extend(included_data["domain-keyword"])
                    rules_dict["domain-suffix"].extend(included_data["domain-suffix"])
            elif tag == "full":
                rules_dict["domain"].append(clean_content(content))
        else:
            rules_dict["domain-suffix"].append(clean_content(line))

    return rules_dict
            
