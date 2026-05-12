#!/bin/bash

CSV_FILE="casestudy-results.csv"
JSON_FILE="bugs-matrix.json"

echo '{"include":[' > $JSON_FILE

# Skip the first 4 header rows, process each data row
tail -n +5 "$CSV_FILE" | while IFS=';' read -r application name url issue commit file lines orig_code fixed_code effect rest; do
  # Skip empty rows
  if [ -z "$name" ] || [ -z "$url" ] || [ -z "$commit" ]; then
    continue
  fi
  
  # Extract repo from URL: https://github.com/owner/repo -> owner/repo
  repo=$(echo "$url" | sed -n 's|.*github\.com/\([^/]*/[^/]*\).*|\1|p')
  
  # Only process GitHub repos with valid data
  if [ -n "$repo" ] && [ -n "$commit" ] && [ "$commit" != "commit" ]; then
    # Clean up any quotes from CSV parsing
    name=$(echo "$name" | sed 's/"//g')
    issue=$(echo "$issue" | sed 's/"//g')
    commit=$(echo "$commit" | sed 's/"//g')
    file=$(echo "$file" | sed 's/"//g')
    lines=$(echo "$lines" | sed 's/"//g')
    
    cat << EOF >> $JSON_FILE
{
  "bug": "${name}-${issue}",
  "repo": "$repo", 
  "commit": "$commit",
  "node": "12.x",
  "file": "$file",
  "lines": "$lines"
},
EOF
  fi
done

# Remove last comma and close JSON
sed -i.bak '$ s/,$//' $JSON_FILE && rm $JSON_FILE.bak 2>/dev/null
echo ']}' >> $JSON_FILE

echo "Generated bugs-matrix.json with $(grep -c '"bug":' $JSON_FILE) entries"