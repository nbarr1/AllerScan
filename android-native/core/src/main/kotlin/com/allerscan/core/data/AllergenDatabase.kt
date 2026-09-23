package com.allerscan.core.data

import com.allerscan.core.model.AllergenCategory
import com.allerscan.core.model.AllergenCategory.GRASS
import com.allerscan.core.model.AllergenCategory.INDOOR
import com.allerscan.core.model.AllergenCategory.MOLD
import com.allerscan.core.model.AllergenCategory.TREE
import com.allerscan.core.model.AllergenCategory.WEED

data class Allergen(
    val id: String,
    val name: String,
    val scientificName: String,
    val category: AllergenCategory,
    val season: String,
)

/**
 * The built-in allergens, with the same ids as src/data/allergensDatabase.ts. The ids matter: the
 * server scores against them, and the scan model's `matchedAllergenId` names one of them.
 */
object AllergenDatabase {
    val all: List<Allergen> = listOf(
        Allergen("oak", "Oak Tree", "Quercus spp.", TREE, "Spring (March - May)"),
        Allergen("birch", "Birch Tree", "Betula spp.", TREE, "Spring (April - May)"),
        Allergen("cedar", "Mountain Cedar / Juniper", "Juniperus ashei", TREE, "Winter (December - February)"),
        Allergen("pine", "Pine Tree", "Pinus spp.", TREE, "Late Spring (May - June)"),
        Allergen("maple", "Maple Tree", "Acer spp.", TREE, "Early Spring (March - April)"),
        Allergen("elm", "Elm Tree", "Ulmus spp.", TREE, "Early Spring & Fall"),
        Allergen("ash", "Ash Tree", "Fraxinus spp.", TREE, "Spring (April - May)"),
        Allergen("bermuda_grass", "Bermuda Grass", "Cynodon dactylon", GRASS, "Late Spring to Autumn (May - October)"),
        Allergen("timothy_grass", "Timothy Grass", "Phleum pratense", GRASS, "Early Summer (June - July)"),
        Allergen("kentucky_bluegrass", "Kentucky Bluegrass", "Poa pratensis", GRASS, "Late Spring (May - June)"),
        Allergen("ryegrass", "Perennial Ryegrass", "Lolium perenne", GRASS, "Spring to Early Summer"),
        Allergen("ragweed", "Ragweed", "Ambrosia artemisiifolia", WEED, "Late Summer to Fall (August - October)"),
        Allergen("sagebrush", "Sagebrush / Mugwort", "Artemisia spp.", WEED, "Late Summer & Fall (August - September)"),
        Allergen("pigweed", "Pigweed / Amaranth", "Amaranthus spp.", WEED, "Summer to Autumn (July - October)"),
        Allergen("english_plantain", "English Plantain", "Plantago lanceolata", WEED, "May to September"),
        Allergen("alternaria", "Alternaria Mold", "Alternaria alternata", MOLD, "Summer & Autumn (July - October)"),
        Allergen("cladosporium", "Cladosporium Mold", "Cladosporium herbarum", MOLD, "Year-round (Peaks in Summer)"),
        Allergen("aspergillus", "Aspergillus Mold", "Aspergillus fumigatus", MOLD, "Year-round (Highest in Autumn/Winter indoors)"),
        Allergen("dust_mites", "Dust Mites", "Dermatophagoides pteronyssinus", INDOOR, "Year-round (Peaks in humid seasons)"),
        Allergen("pet_dander_cat", "Cat Dander (Fel d 1)", "Felis catus allergen", INDOOR, "Year-round"),
        Allergen("pet_dander_dog", "Dog Dander (Can f 1)", "Canis lupus familiaris allergen", INDOOR, "Year-round"),
    )

    private val byId: Map<String, Allergen> = all.associateBy { it.id }

    fun byId(id: String): Allergen? = byId[id]

    fun byCategory(): Map<AllergenCategory, List<Allergen>> = all.groupBy { it.category }
}
