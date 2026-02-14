#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import re
import glob
import os

root = r"c:\Users\KABUM\Desktop\projetos\ggold-joias"
files = [f for f in glob.glob(os.path.join(root, "*.html"))]
missing = []

for path in files:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            text = f.read()
        
        # Split por product-card
        parts = re.split(r'<div class="product-card"', text, flags=re.I)
        
        for i, part in enumerate(parts[1:], 1):
            block = '<div class="product-card"' + part
            
            # Verificar se tem preço
            has_price = bool(re.search(r'class="price"|class="product-price"|R\$', block))
            
            if not has_price:
                # Extrair título
                title_match = re.search(r'<h3>(.*?)</h3>', block, flags=re.S | re.I)
                title = title_match.group(1).strip() if title_match else f'(card {i})'
                missing.append((os.path.basename(path), title))
    
    except Exception as e:
        print(f"Erro ao processar {path}: {e}")

if missing:
    print("PRODUTOS SEM PREÇO ENCONTRADOS:")
    print("=" * 70)
    for arquivo, titulo in missing:
        print(f"- {arquivo}: {titulo}")
    print("=" * 70)
    print(f"Total de produtos sem preço: {len(missing)}")
else:
    print("✓ Nenhum produto sem preço encontrado!")
