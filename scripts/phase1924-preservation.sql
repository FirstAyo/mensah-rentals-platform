SELECT json_build_object(
  'categories', (SELECT count(*) FROM "Category"),
  'products', (SELECT count(*) FROM "Product"),
  'product_description_hash', (SELECT md5(coalesce(string_agg(id || ':' || coalesce(description,''), '|' ORDER BY id),'')) FROM "Product"),
  'product_slug_hash', (SELECT md5(coalesce(string_agg(id || ':' || slug, '|' ORDER BY id),'')) FROM "Product"),
  'category_slug_hash', (SELECT md5(coalesce(string_agg(id || ':' || slug, '|' ORDER BY id),'')) FROM "Category"),
  'product_images', (SELECT count(*) FROM "ProductImage"),
  'homepage_media', (SELECT count(*) FROM "HomepageMedia"),
  'gallery_projects', (SELECT count(*) FROM "GalleryProject"),
  'inventory', (SELECT count(*) FROM "Inventory")
);
