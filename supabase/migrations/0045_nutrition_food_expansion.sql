-- Migration 0045: Nutrition food expansion — 90 common foods seeded globally.
-- Source: USDA FoodData Central approximate values.
-- All rows: is_global = TRUE, user_id = NULL.

INSERT INTO public.foods (name, serving_size_g, serving_label, calories, protein_g, carbs_g, fat_g, fiber_g, saturated_fat_g, sugar_g, sodium_mg, is_global, user_id, tags)
VALUES

-- ============================================================
-- PROTEINS (20 foods)
-- ============================================================
('Turkey Breast, Cooked',         100, '100g',    189,  29.0,  0.0, 7.0,  0.0, 2.0, 0.0,  60, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'poultry'])),
('Ground Beef 85/15, Cooked',     100, '100g',    218,  26.0,  0.0, 13.0, 0.0, 5.0, 0.0,  70, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'beef'])),
('Ground Turkey 93/7',            100, '100g',    170,  22.0,  0.0,  9.0, 0.0, 2.5, 0.0,  70, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'poultry'])),
('Pork Tenderloin, Cooked',       100, '100g',    166,  25.0,  0.0,  6.0, 0.0, 2.0, 0.0,  50, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'pork'])),
('Tilapia, Cooked',               100, '100g',    128,  26.0,  0.0,  3.0, 0.0, 1.0, 0.0,  52, TRUE, NULL, to_jsonb(ARRAY['protein', 'fish', 'seafood'])),
('Shrimp, Cooked',                100, '100g',     99,  24.0,  0.0,  0.3, 0.0, 0.1, 0.0, 148, TRUE, NULL, to_jsonb(ARRAY['protein', 'seafood'])),
('Cod, Cooked',                   100, '100g',    105,  23.0,  0.0,  0.9, 0.0, 0.2, 0.0,  78, TRUE, NULL, to_jsonb(ARRAY['protein', 'fish', 'seafood'])),
('Chicken Thigh, Cooked',         100, '100g',    209,  26.0,  0.0, 11.0, 0.0, 3.0, 0.0,  77, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'poultry'])),
('Deli Turkey Breast',             28, '1 oz',     30,   5.0,  1.0,  0.5, 0.0, 0.1, 0.0, 270, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'poultry', 'deli'])),
('Hard-Boiled Egg',                50, '1 large',  77,   6.0,  0.6,  5.0, 0.0, 1.5, 0.6,  62, TRUE, NULL, to_jsonb(ARRAY['protein', 'egg'])),
('Egg Whites',                     33, '1 white',  17,   4.0,  0.2,  0.1, 0.0, 0.0, 0.2,  55, TRUE, NULL, to_jsonb(ARRAY['protein', 'egg'])),
('Edamame, Shelled',              100, '100g',    122,  11.0, 10.0,  5.0, 5.0, 0.7, 2.0,   6, TRUE, NULL, to_jsonb(ARRAY['protein', 'legume', 'vegetable'])),
('Chickpeas, Cooked',             100, '100g',    164,   9.0, 27.0,  3.0, 8.0, 0.3, 5.0,   7, TRUE, NULL, to_jsonb(ARRAY['protein', 'legume', 'carb'])),
('Tempeh',                        100, '100g',    195,  20.0,  9.0, 11.0, 5.0, 2.2, 0.0,   9, TRUE, NULL, to_jsonb(ARRAY['protein', 'legume', 'vegan'])),
('Canned Salmon',                  85, '3 oz',    128,  18.0,  0.0,  6.0, 0.0, 1.3, 0.0, 338, TRUE, NULL, to_jsonb(ARRAY['protein', 'fish', 'seafood'])),
('Mozzarella, Part-Skim',          28, '1 oz',     72,   7.0,  1.0,  4.5, 0.0, 2.9, 0.4, 175, TRUE, NULL, to_jsonb(ARRAY['protein', 'dairy', 'cheese'])),
('String Cheese',                  28, '1 stick',  80,   7.0,  1.0,  5.0, 0.0, 3.0, 0.0, 200, TRUE, NULL, to_jsonb(ARRAY['protein', 'dairy', 'cheese', 'snack'])),
('Turkey Sausage',                 85, '3 oz',    140,  16.0,  1.0,  8.0, 0.0, 2.5, 1.0, 680, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'poultry', 'processed'])),
('Lean Ham, Sliced',               28, '1 oz',     35,   5.0,  1.0,  1.5, 0.0, 0.5, 0.0, 350, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'pork', 'deli'])),
('Beef Jerky',                     28, '1 oz',    116,   9.0,  3.0,  7.0, 0.0, 3.0, 2.0, 506, TRUE, NULL, to_jsonb(ARRAY['protein', 'meat', 'beef', 'snack'])),

-- ============================================================
-- GRAINS & CARBS (15 foods)
-- ============================================================
('Pasta, Cooked',                 100, '100g',    158,   6.0, 31.0,  1.0, 1.8, 0.1, 0.6,   1, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'pasta'])),
('Whole Wheat Pasta, Cooked',     100, '100g',    149,   6.0, 29.0,  1.0, 4.0, 0.1, 0.5,   3, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'pasta', 'whole_grain'])),
('White Bread',                    30, '1 slice',  79,   3.0, 15.0,  1.0, 0.6, 0.2, 1.5, 147, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'bread'])),
('Sourdough Bread',                50, '1 slice', 122,   5.0, 23.0,  1.0, 1.0, 0.1, 1.0, 246, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'bread'])),
('Bagel, Plain',                  105, '1 medium',270,  10.0, 53.0,  2.0, 2.0, 0.3, 6.0, 430, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'bread'])),
('Flour Tortilla',                 45, '1 medium',140,   4.0, 24.0,  3.0, 1.5, 0.8, 2.0, 320, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'bread'])),
('Corn Tortilla',                  26, '1 small',  60,   2.0, 12.0,  0.7, 1.4, 0.1, 0.2,  11, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'bread'])),
('Rice Cakes, Plain',               9, '1 cake',   35,   0.7,  7.0,  0.3, 0.4, 0.1, 0.0,  20, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'snack'])),
('Granola, Plain',                 28, '1 oz',    120,   3.0, 20.0,  4.0, 2.0, 0.5, 6.0,   5, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'breakfast'])),
('Cheerios',                       28, '1 cup',   104,   3.0, 21.0,  2.0, 3.0, 0.3, 2.0, 190, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'breakfast', 'cereal'])),
('Cream of Wheat, Cooked',        240, '1 cup',   133,   4.0, 28.0,  0.5, 1.0, 0.1, 0.0, 268, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'breakfast'])),
('Corn, Cooked',                  100, '100g',     96,   3.4, 21.0,  1.5, 2.4, 0.2, 4.5,  15, TRUE, NULL, to_jsonb(ARRAY['carb', 'vegetable', 'grain'])),
('Peas, Green, Cooked',           100, '100g',     84,   5.4, 15.0,  0.4, 5.5, 0.1, 6.0,   3, TRUE, NULL, to_jsonb(ARRAY['carb', 'vegetable', 'legume'])),
('Whole Wheat Crackers',           15, '5 crackers', 70,  1.5, 11.0,  2.0, 1.5, 0.4, 0.5, 130, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'snack', 'whole_grain'])),
('Popcorn, Air-Popped',             8, '1 cup',    31,   1.0,  6.0,  0.4, 1.2, 0.1, 0.0,   0, TRUE, NULL, to_jsonb(ARRAY['carb', 'grain', 'snack'])),

-- ============================================================
-- FRUITS (10 foods)
-- ============================================================
('Orange, Medium',                131, '1 medium', 62,   1.2, 15.0,  0.2, 3.1, 0.0, 12.0,  0, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Strawberries',                  100, '100g',     32,   0.7,  8.0,  0.3, 2.0, 0.0,  4.9,  1, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Grapes, Red',                   100, '100g',     69,   0.6, 18.0,  0.2, 0.9, 0.1, 15.0,  2, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Mango, Diced',                  100, '100g',     60,   0.8, 15.0,  0.4, 1.6, 0.1, 14.0,  1, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Pineapple Chunks',              100, '100g',     50,   0.5, 13.0,  0.1, 1.4, 0.0, 10.0,  1, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Watermelon',                    100, '100g',     30,   0.6,  8.0,  0.2, 0.4, 0.0,  6.0,  1, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Raspberries',                   100, '100g',     52,   1.2, 12.0,  0.7, 6.5, 0.0,  4.4,  1, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Peach, Medium',                 150, '1 medium', 58,   1.4, 14.0,  0.4, 2.3, 0.0, 13.0,  0, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Kiwi',                           76, '1 medium', 46,   0.9, 11.0,  0.4, 2.3, 0.0,  7.0,  3, TRUE, NULL, to_jsonb(ARRAY['fruit'])),
('Cherries',                      100, '100g',     63,   1.1, 16.0,  0.2, 2.1, 0.1, 13.0,  0, TRUE, NULL, to_jsonb(ARRAY['fruit'])),

-- ============================================================
-- VEGETABLES (10 foods)
-- ============================================================
('Kale, Raw',                     100, '100g',     49,   4.3,  9.0,  0.9, 3.6, 0.1,  2.3, 38, TRUE, NULL, to_jsonb(ARRAY['vegetable', 'leafy_green'])),
('Cucumber',                      100, '100g',     16,   0.7,  4.0,  0.1, 0.5, 0.0,  1.7,  2, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Bell Pepper, Red',              100, '100g',     31,   1.0,  6.0,  0.3, 2.1, 0.0,  4.2,  4, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Tomato, Raw',                   100, '100g',     18,   0.9,  4.0,  0.2, 1.2, 0.0,  2.6,  5, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Carrots, Raw',                  100, '100g',     41,   0.9, 10.0,  0.2, 2.8, 0.0,  4.7, 69, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Celery',                        100, '100g',     16,   0.7,  3.0,  0.2, 1.6, 0.0,  1.3, 80, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Green Beans, Cooked',           100, '100g',     35,   1.9,  8.0,  0.1, 3.4, 0.0,  1.6,  1, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Asparagus, Cooked',             100, '100g',     22,   2.4,  4.0,  0.2, 1.8, 0.1,  1.3, 14, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Zucchini, Cooked',              100, '100g',     17,   1.1,  3.0,  0.4, 1.0, 0.1,  2.4,  2, TRUE, NULL, to_jsonb(ARRAY['vegetable'])),
('Romaine Lettuce',               100, '100g',     17,   1.2,  3.0,  0.3, 2.1, 0.0,  1.3,  8, TRUE, NULL, to_jsonb(ARRAY['vegetable', 'leafy_green'])),

-- ============================================================
-- DAIRY & ALTERNATIVES (10 foods)
-- ============================================================
('Skim Milk',                     240, '1 cup',    83,   8.0, 12.0,  0.2, 0.0, 0.1, 12.0, 103, TRUE, NULL, to_jsonb(ARRAY['dairy', 'milk'])),
('Almond Milk, Unsweetened',      240, '1 cup',    36,   1.0,  1.5,  2.5, 0.5, 0.0,  0.0, 150, TRUE, NULL, to_jsonb(ARRAY['dairy_alternative', 'milk'])),
('Oat Milk, Unsweetened',         240, '1 cup',    90,   3.0, 16.0,  2.0, 2.0, 0.2,  7.0, 130, TRUE, NULL, to_jsonb(ARRAY['dairy_alternative', 'milk'])),
('Cream Cheese',                   29, '2 tbsp',   99,   2.0,  2.0, 10.0, 0.0, 6.0,  1.0,  93, TRUE, NULL, to_jsonb(ARRAY['dairy', 'cheese', 'fat'])),
('Butter, Unsalted',               14, '1 tbsp',  100,   0.1,  0.0, 11.0, 0.0, 7.0,  0.0,   2, TRUE, NULL, to_jsonb(ARRAY['fat', 'dairy'])),
('Sour Cream, Full Fat',           28, '2 tbsp',   59,   0.7,  1.4,  6.0, 0.0, 3.7,  1.3,  15, TRUE, NULL, to_jsonb(ARRAY['dairy', 'fat', 'condiment'])),
('Greek Yogurt 2%, Plain',        170, '1 cup',   130,  17.0,  8.0,  3.5, 0.0, 2.5,  7.0,  65, TRUE, NULL, to_jsonb(ARRAY['dairy', 'protein', 'yogurt'])),
('Fage 0% Greek Yogurt',          170, '1 cup',   100,  18.0,  7.0,  0.0, 0.0, 0.0,  7.0,  65, TRUE, NULL, to_jsonb(ARRAY['dairy', 'protein', 'yogurt'])),
('Parmesan, Grated',                5, '1 tbsp',   22,   2.0,  0.2,  1.5, 0.0, 0.9,  0.0,  76, TRUE, NULL, to_jsonb(ARRAY['dairy', 'cheese'])),
('Heavy Cream',                    15, '1 tbsp',   52,   0.3,  0.4,  5.5, 0.0, 3.4,  0.4,   6, TRUE, NULL, to_jsonb(ARRAY['dairy', 'fat'])),

-- ============================================================
-- FATS, NUTS & SEEDS (10 foods)
-- ============================================================
('Walnuts',                        28, '1 oz',    185,   4.3,  4.0, 18.0, 1.9, 1.7,  0.7,  1, TRUE, NULL, to_jsonb(ARRAY['fat', 'nut', 'snack'])),
('Cashews',                        28, '1 oz',    157,   5.0,  9.0, 12.0, 0.9, 2.2,  1.7,  3, TRUE, NULL, to_jsonb(ARRAY['fat', 'nut', 'snack'])),
('Sunflower Seeds',                28, '1 oz',    165,   5.5,  7.0, 14.0, 2.4, 1.5,  1.0,  1, TRUE, NULL, to_jsonb(ARRAY['fat', 'seed', 'snack'])),
('Chia Seeds',                     28, '2 tbsp',  138,   4.7, 12.0,  8.7, 9.8, 0.9,  0.0,  5, TRUE, NULL, to_jsonb(ARRAY['fat', 'seed', 'fiber'])),
('Flaxseeds, Ground',              10, '1 tbsp',   55,   1.9,  3.0,  4.3, 2.8, 0.4,  0.2,  4, TRUE, NULL, to_jsonb(ARRAY['fat', 'seed', 'fiber'])),
('Mixed Nuts',                     28, '1 oz',    172,   4.8,  7.5, 15.0, 2.0, 2.0,  1.5,  4, TRUE, NULL, to_jsonb(ARRAY['fat', 'nut', 'snack'])),
('Hummus',                         30, '2 tbsp',   54,   2.5,  5.0,  3.3, 2.0, 0.5,  0.3, 135, TRUE, NULL, to_jsonb(ARRAY['fat', 'legume', 'condiment'])),
('Coconut Oil',                    14, '1 tbsp',  121,   0.0,  0.0, 13.5, 0.0, 11.7, 0.0,   0, TRUE, NULL, to_jsonb(ARRAY['fat', 'oil'])),
('Avocado Oil',                    14, '1 tbsp',  124,   0.0,  0.0, 14.0, 0.0, 1.6,  0.0,   0, TRUE, NULL, to_jsonb(ARRAY['fat', 'oil'])),
('Tahini',                         15, '1 tbsp',   89,   2.6,  3.2,  8.0, 1.4, 1.1,  0.1,   5, TRUE, NULL, to_jsonb(ARRAY['fat', 'seed', 'condiment'])),

-- ============================================================
-- CONDIMENTS & EXTRAS (5 foods)
-- ============================================================
('Ketchup',                        17, '1 tbsp',   19,   0.3,  5.0,  0.0, 0.1, 0.0,  3.7, 154, TRUE, NULL, to_jsonb(ARRAY['condiment'])),
('Sriracha',                        6, '1 tsp',     6,   0.1,  1.4,  0.0, 0.0, 0.0,  0.8,  87, TRUE, NULL, to_jsonb(ARRAY['condiment'])),
('Soy Sauce, Low Sodium',          15, '1 tbsp',   10,   1.3,  1.0,  0.0, 0.0, 0.0,  0.1, 575, TRUE, NULL, to_jsonb(ARRAY['condiment'])),
('Salsa',                          30, '2 tbsp',   10,   0.5,  2.0,  0.0, 0.5, 0.0,  1.5, 200, TRUE, NULL, to_jsonb(ARRAY['condiment', 'vegetable'])),
('Ranch Dressing',                 30, '2 tbsp',  120,   0.5,  2.0, 12.0, 0.0, 2.0,  1.5, 260, TRUE, NULL, to_jsonb(ARRAY['condiment', 'fat'])),

-- ============================================================
-- COMMON GYM FOODS (10 foods)
-- ============================================================
('Quest Protein Bar',              60, '1 bar',   200,  21.0, 21.0,  8.0, 14.0, 3.5, 1.0, 250, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'snack', 'bar'])),
('Rice Krispies Treat',            22, '1 bar',    90,   1.0, 18.0,  2.0, 0.0, 0.5,  9.0,  80, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'carb', 'snack', 'bar'])),
('Rotisserie Chicken Breast',     100, '100g',    185,  27.0,  0.0,  8.0, 0.0, 2.0,  0.0, 340, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'meat', 'poultry'])),
('Overnight Oats, Basic',         350, '1 serving', 380, 15.0, 54.0, 12.0, 6.0, 2.0, 14.0, 120, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'carb', 'breakfast', 'grain'])),
('Chicken Rice Bowl',             350, '1 serving', 473, 32.0, 58.0, 10.0, 2.0, 2.0,  0.0, 400, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'carb', 'meal'])),
('Protein Pancakes',              100, '2 pancakes', 220, 20.0, 22.0, 6.0, 2.0, 1.5, 6.0, 350, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'carb', 'breakfast'])),
('Clif Bar, Original',             68, '1 bar',   250,   9.0, 43.0,  5.0, 5.0, 0.5, 21.0, 200, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'carb', 'snack', 'bar'])),
('RX Bar, Chocolate Sea Salt',     52, '1 bar',   210,  12.0, 24.0,  9.0, 5.0, 2.0, 15.0, 260, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'snack', 'bar'])),
('Protein Bar, Generic',           60, '1 bar',   200,  20.0, 22.0,  7.0, 5.0, 3.0,  5.0, 200, TRUE, NULL, to_jsonb(ARRAY['gym_food', 'protein', 'snack', 'bar'])),
('Banana',                        118, '1 medium', 105,   1.3, 27.0,  0.4, 3.1, 0.1, 14.0,   1, TRUE, NULL, to_jsonb(ARRAY['fruit', 'gym_food', 'carb']))

ON CONFLICT DO NOTHING;
