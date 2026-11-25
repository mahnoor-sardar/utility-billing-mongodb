"""Pakistani names, cities, areas and businesses for synthetic data."""
import random

MALE = ["Muhammad", "Ahmed", "Ali", "Hassan", "Hussain", "Usman", "Umar", "Bilal", "Hamza", "Zain", "Faisal",
        "Imran", "Kamran", "Adnan", "Asad", "Saad", "Talha", "Danish", "Shahzad", "Waqas", "Junaid", "Haris",
        "Fahad", "Arslan", "Shoaib", "Irfan", "Naveed", "Tariq", "Zubair", "Abdullah", "Rehan", "Owais",
        "Moiz", "Sohail", "Khurram", "Yasir", "Noman", "Salman", "Shahid", "Babar", "Atif", "Hanzala", "Abdur Rehman"]
FEMALE = ["Ayesha", "Fatima", "Mahnoor", "Zainab", "Maryam", "Hira", "Sana", "Amna", "Iqra", "Aiman", "Mehwish",
          "Sadia", "Rabia", "Nimra", "Areeba", "Laiba", "Komal", "Saba", "Bushra", "Kiran", "Hafsa", "Anum",
          "Maham", "Sidra", "Javeria", "Nida", "Alishba", "Eman", "Khadija", "Rimsha", "Mahrukh", "Noor"]
SURNAMES = ["Khan", "Ahmed", "Malik", "Qureshi", "Sheikh", "Butt", "Chaudhry", "Raja", "Abbasi", "Jadoon",
            "Awan", "Mughal", "Siddiqui", "Hashmi", "Rana", "Bhatti", "Gillani", "Shah", "Yousafzai", "Swati",
            "Tanoli", "Durrani", "Afridi", "Khattak", "Mir", "Baig", "Akhtar", "Iqbal", "Javed", "Aslam", "Sardar",
            "Abid", "Niazi", "Kayani", "Satti", "Zaidi", "Rizvi", "Naqvi"]

CITIES = {  # city: (postal code base, areas)
    "Abbottabad": (22010, ["Jinnahabad", "Supply Bazaar", "Mandian", "Kehal", "Nawanshehr", "PMA Road", "Habibullah Colony", "Cantt"]),
    "Islamabad":  (44000, ["F-7", "F-10", "G-9", "G-11", "I-8", "E-11", "Bahria Enclave", "DHA Phase II"]),
    "Rawalpindi": (46000, ["Satellite Town", "Saddar", "Bahria Town", "Chaklala Scheme III", "Westridge", "Gulraiz"]),
    "Peshawar":   (25000, ["Hayatabad", "University Town", "Gulbahar", "Saddar", "Warsak Road", "Board Bazaar"]),
    "Lahore":     (54000, ["Gulberg", "Johar Town", "DHA Phase 5", "Model Town", "Iqbal Town", "Bahria Town"]),
    "Mansehra":   (21300, ["Shinkiari Road", "Abbottabad Road", "Kashmir Road", "Datta", "Baffa Road"]),
    "Haripur":    (22620, ["Khalabat Township", "Sector 4", "Pandak", "Railway Road", "GT Road"]),
}
CITY_WEIGHTS = [40, 15, 10, 10, 10, 8, 7]

BUSINESS_TYPE = ["Traders", "General Store", "Bakers & Sweets", "Pharmacy", "Restaurant", "Textiles",
                 "Marble Works", "Hotel", "Steel Works", "Medical Centre", "Electronics", "Cold Storage",
                 "Flour Mills", "Auto Workshop", "School System", "Petroleum Service"]
BUSINESS_PREFIX = ["Al-Madina", "Al-Noor", "Bismillah", "Madni", "Khyber", "Hazara", "Pak", "Shaheen", "Faisal",
                   "Rehmat", "Al-Rehman", "Karakoram", "Margalla", "Sarhad", "Iqbal", "Ittefaq", "Usmania"]
MOBILE_PREFIX = ["0300", "0301", "0302", "0312", "0313", "0321", "0322", "0331", "0333", "0345", "0346", "0355"]
DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]

def person():
    if random.random() < 0.55:
        first = random.choice(MALE); return f"{first} {random.choice(SURNAMES)}"
    return f"{random.choice(FEMALE)} {random.choice(SURNAMES)}"

def business():
    return f"{random.choice(BUSINESS_PREFIX)} {random.choice(BUSINESS_TYPE)}"

def phone():
    return random.choice(MOBILE_PREFIX) + str(random.randint(1000000, 9999999))

def email(name):
    base = "".join(ch for ch in name.lower().replace(" ", ".") if ch.isalnum() or ch == ".").strip(".")
    return f"{base}{random.randint(1, 999)}@{random.choice(DOMAINS)}"

def address():
    city = random.choices(list(CITIES), CITY_WEIGHTS)[0]
    code, areas = CITIES[city]
    area = random.choice(areas)
    street = random.choice([f"House {random.randint(1, 900)}, Street {random.randint(1, 40)}, {area}",
                            f"Plot {random.randint(1, 300)}, {area}",
                            f"Shop {random.randint(1, 120)}, Main Bazaar, {area}"])
    return {"street": street, "city": city, "postal_code": str(code + random.randint(0, 9))}
